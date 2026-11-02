import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectLimiter, sendLimiter, testSendLimiter } from "@/lib/limiters";
import { authCookie, cookieFrom, jsonRequest as rawJsonRequest, joinCookies, makeFakeMailer, type FakeMailer } from "./helpers";

let currentMailer: FakeMailer;
vi.mock("@/lib/mail/transport", () => ({
  createMailer: vi.fn(() => currentMailer),
}));

const sessionRoute = () => import("@/app/api/session/route");
const sendRoute = () => import("@/app/api/send/route");
const testSendRoute = () => import("@/app/api/test-send/route");

const creds = {
  user: "team@mybedigital.com",
  password: "abcd efgh ijkl mnop",
  fromName: "ResumeStart Team",
  fromAddress: "team@resumestart.ai",
  replyTo: "team@resumestart.ai",
};

// Every request comes from a signed-in Google account; the mailbox cookie rides along on top.
let signedIn: string;
function jsonRequest(url: string, method: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}): Request {
  return rawJsonRequest(url, method, body, joinCookies(signedIn, cookie), extra);
}

async function connect(body: unknown = creds) {
  const { POST } = await sessionRoute();
  return POST(jsonRequest("/api/session", "POST", body));
}

beforeEach(async () => {
  signedIn = await authCookie(creds.user);
  connectLimiter.reset();
  sendLimiter.reset();
  testSendLimiter.reset();
  currentMailer = makeFakeMailer();
  vi.unstubAllEnvs();
  vi.stubEnv("SEND_DELAY_MS", "0");
});

describe("POST /api/session", () => {
  it("verifies, seals the cookie, and returns only the public profile", async () => {
    const res = await connect();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      connected: true,
      profile: { user: "team@mybedigital.com", fromAddress: "team@resumestart.ai", replyTo: "team@resumestart.ai", fromName: "ResumeStart Team" },
      quota: { perDay: 2000 },
    });
    expect(JSON.stringify(body)).not.toContain("abcdefghijklmnop");
    expect(currentMailer.verify).toHaveBeenCalled();
    expect(currentMailer.close).toHaveBeenCalled();

    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toMatch(/postie_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toContain("abcdefghijklmnop");
    expect(decodeURIComponent(setCookie)).not.toContain("abcd efgh");
  });

  it("defaults From and Reply-To to the account email", async () => {
    const res = await connect({ user: creds.user, password: creds.password });
    const { profile } = await res.json();
    expect(profile).toMatchObject({ fromAddress: creds.user, replyTo: creds.user, fromName: "" });
  });

  it("returns a mapped message and sets no cookie when verification fails", async () => {
    currentMailer = makeFakeMailer({
      verify: async () => {
        throw { code: "EAUTH", responseCode: 535, message: "abcdefghijklmnop rejected" };
      },
    });
    const res = await connect();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("auth");
    expect(JSON.stringify(body)).not.toContain("abcdefghijklmnop");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(currentMailer.close).toHaveBeenCalled();
  });

  it("rejects invalid input with a clear message", async () => {
    const res = await connect({ user: "nope", password: creds.password });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/valid email/i);
  });

  it("rejects non-JSON bodies", async () => {
    const { POST } = await sessionRoute();
    const res = await POST(new Request("http://localhost/api/session", { method: "POST", headers: { cookie: signedIn }, body: "not json" }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const { POST } = await sessionRoute();
    const res = await POST(
      new Request("http://localhost/api/session", { method: "POST", headers: { cookie: signedIn, "content-length": "99999999" }, body: "{}" }),
    );
    expect(res.status).toBe(413);
  });

  it("rate-limits repeated attempts", async () => {
    for (let i = 0; i < 8; i++) await connect({ user: "bad", password: "x" });
    const res = await connect();
    expect(res.status).toBe(429);
  });

  it("enforces ACCESS_CODE when configured", async () => {
    vi.stubEnv("ACCESS_CODE", "open-sesame");
    expect((await connect()).status).toBe(403);
    expect((await connect({ ...creds, accessCode: "wrong" })).status).toBe(403);
    expect((await connect({ ...creds, accessCode: "open-sesame" })).status).toBe(200);
  });

  it("supports the local default account in development only", async () => {
    vi.stubEnv("SMTP_USER", "local@mybedigital.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "abcdefghijklmnop");
    vi.stubEnv("MAIL_FROM_ADDRESS", "team@resumestart.ai");
    const res = await connect({ local: true });
    expect(res.status).toBe(200);
    expect((await res.json()).profile).toMatchObject({ user: "local@mybedigital.com", fromAddress: "team@resumestart.ai" });

    vi.unstubAllEnvs();
    expect((await connect({ local: true })).status).toBe(400);
  });
});

describe("GET/DELETE /api/session", () => {
  it("reports disconnected without a cookie, with non-secret server hints", async () => {
    const { GET } = await sessionRoute();
    const res = await GET(jsonRequest("/api/session", "GET"));
    expect(await res.json()).toMatchObject({ connected: false, accessCodeRequired: false, maxRecipientsPerRun: 100 });
  });

  it("round-trips the cookie and then disconnects", async () => {
    const cookie = cookieFrom(await connect());
    const { GET, DELETE } = await sessionRoute();
    const status = await (await GET(jsonRequest("/api/session", "GET", undefined, cookie))).json();
    expect(status).toMatchObject({ connected: true, profile: { user: creds.user } });
    expect(JSON.stringify(status)).not.toContain("abcdefghijklmnop");

    const del = await DELETE(jsonRequest("/api/session", "DELETE", undefined, cookie));
    expect(await del.json()).toMatchObject({ connected: false });
    const cleared = cookieFrom(del);
    const after = await (await GET(jsonRequest("/api/session", "GET", undefined, cleared))).json();
    expect(after.connected).toBe(false);
  });

  it("treats a tampered cookie as signed out", async () => {
    const { GET } = await sessionRoute();
    const res = await GET(jsonRequest("/api/session", "GET", undefined, "postie_session=garbage"));
    expect((await res.json()).connected).toBe(false);
  });
});

describe("POST /api/send", () => {
  const messages = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ rowId: `r${i}`, to: `u${i}@x.io`, subject: `Hi ${i}`, html: `<p>Hello ${i}</p>` }));

  it("401s without a session", async () => {
    const { POST } = await sendRoute();
    const res = await POST(jsonRequest("/api/send", "POST", { messages: messages(1) }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("no-session");
    expect(currentMailer.sent).toHaveLength(0);
  });

  it("sends using From and Reply-To from the session, not the body", async () => {
    const cookie = cookieFrom(await connect());
    const { POST } = await sendRoute();
    const body = { messages: messages(2).map((m) => ({ ...m, from: "evil@x.io", replyTo: "evil@x.io" })) };
    const res = await POST(jsonRequest("/api/send", "POST", body, cookie));
    expect(res.status).toBe(200);
    expect((await res.json()).outcomes.map((o: { status: string }) => o.status)).toEqual(["sent", "sent"]);
    expect(currentMailer.sent).toHaveLength(2);
    expect(currentMailer.sent[0]).toMatchObject({
      from: { name: "ResumeStart Team", address: "team@resumestart.ai" },
      replyTo: "team@resumestart.ai",
      to: "u0@x.io",
      text: "Hello 0",
    });
    expect(currentMailer.close).toHaveBeenCalled();
  });

  it("refreshes the cookie so long runs stay signed in", async () => {
    const cookie = cookieFrom(await connect());
    const { POST } = await sendRoute();
    const res = await POST(jsonRequest("/api/send", "POST", { messages: messages(1) }, cookie));
    expect(res.headers.getSetCookie().join("")).toMatch(/postie_session=/);
  });

  it("enforces the per-request cap and validates recipients", async () => {
    const cookie = cookieFrom(await connect());
    const { POST } = await sendRoute();
    expect((await POST(jsonRequest("/api/send", "POST", { messages: messages(11) }, cookie))).status).toBe(400);
    expect((await POST(jsonRequest("/api/send", "POST", { messages: [{ ...messages(1)[0], to: "bad" }] }, cookie))).status).toBe(400);
    expect(currentMailer.sent).toHaveLength(0);
  });

  it("records a failed row and halts on fatal errors", async () => {
    const cookie = cookieFrom(await connect());
    currentMailer = makeFakeMailer({
      send: async (_m, i) => {
        if (i === 1) throw { responseCode: 550, response: "550 5.4.5 Daily user sending quota exceeded" };
        return {};
      },
    });
    const { POST } = await sendRoute();
    const res = await POST(jsonRequest("/api/send", "POST", { messages: messages(4) }, cookie));
    const data = await res.json();
    expect(data.halted).toBe(true);
    expect(data.outcomes.map((o: { status: string }) => o.status)).toEqual(["sent", "failed", "skipped", "skipped"]);
    expect(data.outcomes[1].code).toBe("rate-limit");
  });

  it("closes the connection even if sending throws unexpectedly", async () => {
    const cookie = cookieFrom(await connect());
    currentMailer = makeFakeMailer();
    const { POST } = await sendRoute();
    const res = await POST(jsonRequest("/api/send", "POST", "not-an-object", cookie));
    expect(res.status).toBe(400);
  });

  it("rate-limits send requests", async () => {
    const cookie = cookieFrom(await connect());
    const { POST } = await sendRoute();
    let last = 200;
    for (let i = 0; i < 61; i++) {
      last = (await POST(jsonRequest("/api/send", "POST", { messages: messages(1) }, cookie))).status;
    }
    expect(last).toBe(429);
  });
});

describe("POST /api/test-send", () => {
  it("401s without a session", async () => {
    const { POST } = await testSendRoute();
    expect((await POST(jsonRequest("/api/test-send", "POST", { subject: "s", html: "<p>x</p>" }))).status).toBe(401);
  });

  it("sends from the alias to the connected account, prefixed [Test]", async () => {
    const cookie = cookieFrom(await connect());
    const { POST } = await testSendRoute();
    const res = await POST(jsonRequest("/api/test-send", "POST", { subject: "Hello Ada", html: "<p>Hi</p>" }, cookie));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sentTo: creds.user, from: "team@resumestart.ai", replyTo: "team@resumestart.ai" });
    expect(currentMailer.sent[0]).toMatchObject({ to: creds.user, subject: "[Test] Hello Ada", from: { address: "team@resumestart.ai" } });
  });

  it("surfaces a mapped error when the test fails", async () => {
    const cookie = cookieFrom(await connect());
    currentMailer = makeFakeMailer({
      send: async () => {
        throw { code: "ETIMEDOUT" };
      },
    });
    const { POST } = await testSendRoute();
    const res = await POST(jsonRequest("/api/test-send", "POST", { subject: "s", html: "<p>x</p>" }, cookie));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/could not reach/i);
  });

  it("validates input", async () => {
    const cookie = cookieFrom(await connect());
    const { POST } = await testSendRoute();
    expect((await POST(jsonRequest("/api/test-send", "POST", { subject: "", html: "x" }, cookie))).status).toBe(400);
  });
});
