import { describe, expect, it, vi } from "vitest";
import {
  htmlToText,
  jitter,
  mapMailError,
  quotaHint,
  redactObject,
  redactSecrets,
  sendBatch,
  getProvider,
  PROVIDERS,
  type Identity,
  type Mailer,
} from "@/lib/mail";

describe("htmlToText", () => {
  it("converts paragraphs, breaks, lists, links and entities", () => {
    const html =
      '<p>Hi Ada &amp; Grace,</p><p>See <a href="https://x.io/a">our site</a>.<br>Bye</p><ul><li>One</li><li>Two</li></ul><style>p{}</style>';
    expect(htmlToText(html)).toBe("Hi Ada & Grace,\n\nSee our site (https://x.io/a).\nBye\n\n- One\n- Two");
  });

  it("prints bare urls once", () => {
    expect(htmlToText('<a href="https://x.io">https://x.io</a>')).toBe("https://x.io");
  });

  it("decodes numeric entities and drops scripts", () => {
    expect(htmlToText("<script>alert(1)</script>caf&#233; &#x2603; &nbsp;ok")).toBe("café ☃  ok");
  });
});

describe("redact", () => {
  it("removes secrets, including spaced app-password form", () => {
    expect(redactSecrets("bad pass abcd efgh ijkl mnop!", ["abcd efgh ijkl mnop"])).toBe("bad pass [redacted]!");
    expect(redactSecrets("token abcdefghijklmnop", ["abcd efgh ijkl mnop"])).toBe("token [redacted]");
  });

  it("ignores empty and tiny secrets", () => {
    expect(redactSecrets("a b c", ["", undefined, null, "a"])).toBe("a b c");
  });

  it("masks sensitive keys deeply", () => {
    expect(redactObject({ user: "u", pass: "x", nested: [{ appPassword: "y", ok: 1 }], Authorization: "z" })).toEqual({
      user: "u",
      pass: "[redacted]",
      nested: [{ appPassword: "[redacted]", ok: 1 }],
      Authorization: "[redacted]",
    });
  });
});

describe("mapMailError", () => {
  it("maps auth failures as fatal", () => {
    const m = mapMailError({ code: "EAUTH", responseCode: 535, message: "Invalid login" });
    expect(m).toMatchObject({ code: "auth", fatal: true });
    expect(m.message).toMatch(/app password/i);
    expect(mapMailError({ message: "Username and Password not accepted" }).code).toBe("auth");
  });

  it("maps daily limit and throttling as fatal rate-limit", () => {
    expect(mapMailError({ responseCode: 550, response: "550 5.4.5 Daily user sending quota exceeded" })).toMatchObject({
      code: "rate-limit",
      fatal: true,
    });
    expect(mapMailError({ responseCode: 421 }).code).toBe("rate-limit");
  });

  it("maps network errors as fatal connection", () => {
    for (const code of ["ETIMEDOUT", "ECONNECTION", "ENOTFOUND", "ECONNRESET"]) {
      expect(mapMailError({ code })).toMatchObject({ code: "connection", fatal: true });
    }
  });

  it("maps refused recipients and bad messages as non-fatal", () => {
    expect(mapMailError({ code: "EENVELOPE" })).toMatchObject({ code: "recipient", fatal: false });
    expect(mapMailError({ responseCode: 553, response: "no such user" })).toMatchObject({ code: "recipient", fatal: false });
    expect(mapMailError({ code: "EMESSAGE" })).toMatchObject({ code: "message", fatal: false });
  });

  it("falls back to unknown without leaking raw text", () => {
    const m = mapMailError(new Error("secret internals 12345"));
    expect(m).toMatchObject({ code: "unknown", fatal: false });
    expect(m.message).not.toMatch(/secret internals/);
    expect(mapMailError(undefined).code).toBe("unknown");
  });
});

describe("providers", () => {
  it("only exposes the allow-listed gmail host", () => {
    expect(Object.keys(PROVIDERS)).toEqual(["gmail"]);
    expect(getProvider("gmail")).toMatchObject({ host: "smtp.gmail.com", port: 465, secure: true });
  });

  it("hints quota by domain", () => {
    expect(quotaHint("me@gmail.com").perDay).toBe(500);
    expect(quotaHint("me@googlemail.com").perDay).toBe(500);
    expect(quotaHint("team@mybedigital.com").perDay).toBe(2000);
  });
});

describe("jitter", () => {
  it("scales between 0.67x and 1.67x and is zero for zero", () => {
    expect(jitter(1000, () => 0)).toBe(670);
    expect(jitter(1000, () => 1)).toBe(1670);
    expect(jitter(0)).toBe(0);
  });
});

describe("sendBatch", () => {
  const identity: Identity = {
    user: "team@mybedigital.com",
    pass: "supersecretapppw",
    fromName: "ResumeStart Team\r\nBcc: x@y.z",
    fromAddress: "team@resumestart.ai",
    replyTo: "team@resumestart.ai",
  };
  const msgs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ rowId: `r${i}`, to: `u${i}@x.io`, subject: `Hi ${i}`, html: `<p>Body ${i}</p>` }));

  function mailer(impl: (i: number) => Promise<unknown>): Mailer & { sendMail: ReturnType<typeof vi.fn> } {
    let i = 0;
    return {
      verify: vi.fn(),
      close: vi.fn(),
      sendMail: vi.fn(() => impl(i++)),
    };
  }

  it("sends every message with session identity, text part and jittered delays", async () => {
    const m = mailer(async () => ({}));
    const sleep = vi.fn(async () => {});
    const r = await sendBatch({ mailer: m, identity, messages: msgs(3), delayMs: 1000, sleep, random: () => 0.33 });
    expect(r.halted).toBe(false);
    expect(r.outcomes.map((o) => o.status)).toEqual(["sent", "sent", "sent"]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    const first = m.sendMail.mock.calls[0][0];
    expect(first).toMatchObject({
      to: "u0@x.io",
      replyTo: "team@resumestart.ai",
      from: { name: "ResumeStart Team Bcc: x@y.z", address: "team@resumestart.ai" },
      text: "Body 0",
    });
  });

  it("continues past a row-level failure", async () => {
    const m = mailer(async (i) => {
      if (i === 1) throw { code: "EENVELOPE" };
      return {};
    });
    const r = await sendBatch({ mailer: m, identity, messages: msgs(3), delayMs: 0, sleep: async () => {} });
    expect(r.outcomes.map((o) => o.status)).toEqual(["sent", "failed", "sent"]);
    expect(r.halted).toBe(false);
  });

  it("halts on a fatal error and skips the rest", async () => {
    const m = mailer(async (i) => {
      if (i === 1) throw { code: "EAUTH", responseCode: 535 };
      return {};
    });
    const r = await sendBatch({ mailer: m, identity, messages: msgs(4), delayMs: 0, sleep: async () => {} });
    expect(r.outcomes.map((o) => o.status)).toEqual(["sent", "failed", "skipped", "skipped"]);
    expect(r.halted).toBe(true);
    expect(m.sendMail).toHaveBeenCalledTimes(2);
  });

  it("never leaks the password into outcomes", async () => {
    const m = mailer(async () => {
      throw { code: "EENVELOPE", message: "supersecretapppw" };
    });
    const r = await sendBatch({ mailer: m, identity, messages: msgs(1), delayMs: 0 });
    expect(JSON.stringify(r)).not.toContain("supersecretapppw");
  });
});
