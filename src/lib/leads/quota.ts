import { createHmac, timingSafeEqual } from "node:crypto";
import type { Account } from "@/lib/account";
import { getStoreOrNull } from "@/lib/db";
import { getEnv } from "@/lib/env";

/** How long one started search may keep calling the lead endpoints. A big search takes a few minutes. */
const RUN_TTL_MS = 20 * 60 * 1000;

export const RUN_HEADER = "x-lead-run";

export interface LeadQuota {
  /** Searches this account may still start. Null means no limit. */
  remaining: number | null;
  limit: number;
}

export type StartResult = { ok: true; token: string; quota: LeadQuota } | { ok: false; reason: "exhausted" | "unavailable"; quota?: LeadQuota };

export function isUnlimited(email: string): boolean {
  return getEnv().leadsUnlimited.includes(email.trim().toLowerCase());
}

function sign(payload: string): string {
  return createHmac("sha256", getEnv().sessionSecret).update(`lead-run:${payload}`).digest("base64url");
}

/** A token that proves this account started a search. Signed, bound to the account, and short-lived. */
export function issueRunToken(email: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ e: email.toLowerCase(), x: now + RUN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyRunToken(token: string | null, email: string, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { e?: unknown; x?: unknown };
    return data.e === email.toLowerCase() && typeof data.x === "number" && data.x > now;
  } catch {
    return false;
  }
}

/** Where this account stands, without using anything up. Null when the count cannot be read. */
export async function readQuota(account: Account): Promise<LeadQuota | null> {
  const { leadsFreeRuns: limit } = getEnv();
  if (isUnlimited(account.email)) return { remaining: null, limit };
  const store = await getStoreOrNull();
  if (!store) return null;
  try {
    return { remaining: Math.max(0, limit - (await store.getLeadRuns(account.email))), limit };
  } catch {
    return null;
  }
}

/**
 * Begin a search: use up one of the account's free searches and hand back the token the lead
 * endpoints require. Unlimited accounts skip the count. Without a database nothing can be counted,
 * so a limited account is refused rather than let through for free.
 */
export async function startLeadRun(account: Account): Promise<StartResult> {
  const { leadsFreeRuns: limit } = getEnv();
  if (isUnlimited(account.email)) return { ok: true, token: issueRunToken(account.email), quota: { remaining: null, limit } };
  const store = await getStoreOrNull();
  if (!store) return { ok: false, reason: "unavailable" };
  try {
    if (!(await store.consumeLeadRun(account.email, limit))) return { ok: false, reason: "exhausted", quota: { remaining: 0, limit } };
    const used = await store.getLeadRuns(account.email);
    return { ok: true, token: issueRunToken(account.email), quota: { remaining: Math.max(0, limit - used), limit } };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
