import { currentAccount } from "@/lib/account";
import { json, noStoreHeaders } from "@/lib/http";
import { readQuota, startLeadRun } from "@/lib/leads/quota";

const SIGNED_OUT = { error: "Sign in to use the lead finder.", code: "signed-out" };

/** How many searches this account has left. Uses nothing up. */
export async function GET(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const account = await currentAccount(request);
  if (!account) return json(SIGNED_OUT, headers, 401);
  const quota = await readQuota(account);
  if (!quota) return json({ error: "Search limits are unavailable right now." }, headers, 503);
  return json(quota, headers);
}

/** Begin one search: counts it against the account and returns the token the other lead routes need. */
export async function POST(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const account = await currentAccount(request);
  if (!account) return json(SIGNED_OUT, headers, 401);
  const result = await startLeadRun(account);
  if (result.ok) return json({ token: result.token, quota: result.quota }, headers);
  if (result.reason === "exhausted") {
    return json({ error: "You have used your free lead searches.", code: "quota-exhausted", quota: result.quota }, headers, 403);
  }
  return json({ error: "Search limits are unavailable right now. Try again in a moment." }, headers, 503);
}
