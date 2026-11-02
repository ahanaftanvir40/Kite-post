import { describe, expect, it } from "vitest";
import { getEnv } from "@/lib/env";
import { clientKey, createRateLimiter } from "@/lib/rateLimit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks, then recovers after the window", () => {
    const rl = createRateLimiter(2, 1000);
    expect(rl.check("a", 0)).toBe(true);
    expect(rl.check("a", 10)).toBe(true);
    expect(rl.check("a", 20)).toBe(false);
    expect(rl.check("b", 20)).toBe(true);
    expect(rl.check("a", 1011)).toBe(true);
  });

  it("reset clears counters", () => {
    const rl = createRateLimiter(1, 1000);
    rl.check("a", 0);
    rl.reset();
    expect(rl.check("a", 1)).toBe(true);
  });

  it("derives client key from proxy headers", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }))).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientKey(new Request("http://x"))).toBe("local");
  });
});

describe("getEnv", () => {
  const dev = { NODE_ENV: "development" } as NodeJS.ProcessEnv;

  it("falls back to a dev secret outside production", () => {
    const e = getEnv(dev);
    expect(e.sessionSecret.length).toBeGreaterThanOrEqual(32);
    expect(e.maxRecipientsPerRun).toBe(100);
    expect(e.sendDelayMs).toBe(1500);
    expect(e.accessCode).toBeNull();
    expect(e.localAccount).toBeNull();
  });

  it("requires a real secret in production", () => {
    expect(() => getEnv({ NODE_ENV: "production", SESSION_SECRET: "short" } as NodeJS.ProcessEnv)).toThrow(/SESSION_SECRET/);
    expect(getEnv({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40) } as NodeJS.ProcessEnv).isProduction).toBe(true);
  });

  it("clamps numeric settings and ignores junk", () => {
    expect(getEnv({ ...dev, MAX_RECIPIENTS_PER_RUN: "999999", SEND_DELAY_MS: "-5" }).maxRecipientsPerRun).toBe(2000);
    expect(getEnv({ ...dev, SEND_DELAY_MS: "-5" }).sendDelayMs).toBe(0);
    expect(getEnv({ ...dev, SEND_DELAY_MS: "abc" }).sendDelayMs).toBe(1500);
  });

  it("treats a missing MONGODB_URI as saving switched off, and names the database", () => {
    expect(getEnv(dev)).toMatchObject({ mongoUri: null, mongoDb: "postie" });
    expect(getEnv({ ...dev, MONGODB_URI: "  mongodb+srv://u:p@h/  ", MONGODB_DB: " mine " })).toMatchObject({
      mongoUri: "mongodb+srv://u:p@h/",
      mongoDb: "mine",
    });
    expect(getEnv({ ...dev, MONGODB_URI: "   " }).mongoUri).toBeNull();
  });

  it("builds the local account only in development", () => {
    const env = { SMTP_USER: "me@x.io", SMTP_APP_PASSWORD: "abcd efgh ijkl mnop", MAIL_FROM_ADDRESS: "team@y.ai", ACCESS_CODE: " code " };
    const d = getEnv({ ...dev, ...env });
    expect(d.localAccount).toMatchObject({ user: "me@x.io", pass: "abcdefghijklmnop", fromAddress: "team@y.ai", replyTo: "team@y.ai" });
    expect(d.accessCode).toBe("code");
    expect(getEnv({ NODE_ENV: "production", SESSION_SECRET: "x".repeat(40), ...env } as NodeJS.ProcessEnv).localAccount).toBeNull();
  });
});
