import { describe, expect, it } from "vitest";
import { connectSchema, firstIssue, MAX_MESSAGES_PER_REQUEST, sendSchema, testSendSchema } from "@/lib/validation/schemas";

describe("connectSchema", () => {
  const valid = { user: "team@mybedigital.com", password: "abcd efgh ijkl mnop" };

  it("accepts a minimal payload, strips spaces from the password, defaults preset", () => {
    const r = connectSchema.parse(valid);
    expect(r.password).toBe("abcdefghijklmnop");
    expect(r.preset).toBe("gmail");
    expect(r.fromName).toBe("");
  });

  it("accepts a From alias and Reply-To", () => {
    const r = connectSchema.parse({ ...valid, fromAddress: "team@resumestart.ai", replyTo: "team@resumestart.ai", fromName: "ResumeStart Team" });
    expect(r.fromAddress).toBe("team@resumestart.ai");
  });

  it.each([
    [{ ...valid, user: "nope" }],
    [{ ...valid, password: "short" }],
    [{ ...valid, preset: "evil-host.example" }],
    [{ ...valid, fromName: "Bob\r\nBcc: a@b.co" }],
    [{ ...valid, fromAddress: "bad" }],
    [{ ...valid, host: "10.0.0.1", password: "" }],
  ])("rejects %j", (input) => {
    expect(connectSchema.safeParse(input).success).toBe(false);
  });

  it("does not pass through a client-supplied host", () => {
    const r = connectSchema.parse({ ...valid, host: "169.254.169.254" } as never);
    expect("host" in r).toBe(false);
  });
});

describe("sendSchema", () => {
  const msg = { rowId: "r1", to: "a@b.co", subject: "Hi", html: "<p>x</p>" };

  it("accepts up to the per-request cap", () => {
    expect(sendSchema.safeParse({ messages: [msg] }).success).toBe(true);
    expect(sendSchema.safeParse({ messages: Array(MAX_MESSAGES_PER_REQUEST).fill(msg) }).success).toBe(true);
  });

  it("rejects empty, oversized and malformed batches", () => {
    expect(sendSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(sendSchema.safeParse({ messages: Array(MAX_MESSAGES_PER_REQUEST + 1).fill(msg) }).success).toBe(false);
    expect(sendSchema.safeParse({ messages: [{ ...msg, to: "bad" }] }).success).toBe(false);
    expect(sendSchema.safeParse({ messages: [{ ...msg, subject: "  " }] }).success).toBe(false);
    expect(sendSchema.safeParse({ messages: [{ ...msg, html: "" }] }).success).toBe(false);
  });

  it("ignores From/Reply-To in the body (they come from the session)", () => {
    const r = sendSchema.parse({ messages: [{ ...msg, from: "evil@x.io", replyTo: "evil@x.io" }] });
    expect(r.messages[0]).not.toHaveProperty("from");
    expect(r.messages[0]).not.toHaveProperty("replyTo");
  });
});

describe("testSendSchema / firstIssue", () => {
  it("validates subject and html", () => {
    expect(testSendSchema.safeParse({ subject: "s", html: "<p>h</p>" }).success).toBe(true);
    const bad = testSendSchema.safeParse({ subject: "", html: "<p>h</p>" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstIssue(bad.error)).toBe("Subject is empty.");
  });
});
