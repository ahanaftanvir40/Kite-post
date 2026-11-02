import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as emails } from "@/app/api/leads/emails/route";
import { GET as quota, POST as start } from "@/app/api/leads/start/route";
import { setStoreForTests } from "@/lib/db";
import { createMemoryStore } from "@/lib/db/memory";
import { issueRunToken } from "@/lib/leads/quota";
import { authCookie, jsonRequest } from "./helpers";

const ALICE = "alice@example.com";
const ADMIN = "boss@example.com";

beforeEach(() => {
  setStoreForTests(createMemoryStore());
  vi.stubEnv("LEADS_FREE_RUNS", "2");
  vi.stubEnv("LEADS_UNLIMITED_EMAILS", ` ${ADMIN.toUpperCase()} , other@example.com `);
});
afterEach(() => {
  setStoreForTests(undefined);
  vi.unstubAllEnvs();
});

async function begin(email: string) {
  return start(jsonRequest("/api/leads/start", "POST", undefined, await authCookie(email)));
}

describe("lead search allowance", () => {
  it("needs a signed-in account", async () => {
    expect((await start(jsonRequest("/api/leads/start", "POST"))).status).toBe(401);
    expect((await quota(jsonRequest("/api/leads/start", "GET"))).status).toBe(401);
  });

  it("gives each account two searches, then says the beta is full", async () => {
    const first = await begin(ALICE);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { quota: { remaining: number } }).quota.remaining).toBe(1);
    expect((await begin(ALICE)).status).toBe(200);

    const third = await begin(ALICE);
    expect(third.status).toBe(403);
    expect(await third.json()).toMatchObject({ code: "quota-exhausted" });

    // Someone else is not affected.
    expect((await begin("bob@example.com")).status).toBe(200);
  });

  it("reading what is left uses nothing up", async () => {
    const cookie = await authCookie(ALICE);
    for (let i = 0; i < 3; i++) {
      const res = await quota(jsonRequest("/api/leads/start", "GET", undefined, cookie));
      expect(await res.json()).toEqual({ remaining: 2, limit: 2 });
    }
  });

  it("lets listed emails search without limit, whatever the case or spacing", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await begin(ADMIN);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { quota: { remaining: number | null } }).quota.remaining).toBeNull();
    }
    expect((await begin("other@example.com")).status).toBe(200);
  });

  it("follows LEADS_FREE_RUNS", async () => {
    vi.stubEnv("LEADS_FREE_RUNS", "1");
    expect((await begin(ALICE)).status).toBe(200);
    expect((await begin(ALICE)).status).toBe(403);
  });

  it("refuses a limited account when searches cannot be counted, but not an unlimited one", async () => {
    setStoreForTests(null);
    expect((await begin(ALICE)).status).toBe(503);
    expect((await begin(ADMIN)).status).toBe(200);
  });
});

describe("lead routes require a started search", () => {
  const body = { urls: ["https://example.com"] };

  it("rejects calls with no token, or a token from someone else", async () => {
    const cookie = await authCookie(ALICE);
    expect((await emails(jsonRequest("/api/leads/emails", "POST", body))).status).toBe(401);
    expect((await emails(jsonRequest("/api/leads/emails", "POST", body, cookie))).status).toBe(403);
    const bobs = issueRunToken("bob@example.com");
    expect((await emails(jsonRequest("/api/leads/emails", "POST", body, cookie, { "x-lead-run": bobs }))).status).toBe(403);
  });

  it("rejects forged and expired tokens", async () => {
    const cookie = await authCookie(ALICE);
    const real = issueRunToken(ALICE);
    const forged = `${real.split(".")[0]}.${"A".repeat(43)}`;
    expect((await emails(jsonRequest("/api/leads/emails", "POST", body, cookie, { "x-lead-run": forged }))).status).toBe(403);
    const old = issueRunToken(ALICE, Date.now() - 60 * 60 * 1000);
    expect((await emails(jsonRequest("/api/leads/emails", "POST", body, cookie, { "x-lead-run": old }))).status).toBe(403);
  });

  it("accepts the token a started search was given", async () => {
    const cookie = await authCookie(ALICE);
    const started = (await (await begin(ALICE)).json()) as { token: string };
    const res = await emails(jsonRequest("/api/leads/emails", "POST", body, cookie, { "x-lead-run": started.token }));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
