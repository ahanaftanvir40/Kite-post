import type { ZodType } from "zod";
import { currentAccount } from "@/lib/account";
import { json, noStoreHeaders, readJson } from "@/lib/http";
import type { RateLimiter } from "@/lib/rateLimit";
import { clientKey } from "@/lib/rateLimit";
import { RUN_HEADER, verifyRunToken } from "./quota";
import { LeadsConfigError } from "./serper";

/**
 * Shared shell for the lead-finder routes: must be signed in and inside a started search (see
 * /api/leads/start), then rate limit, validate, run, map errors. The token is what makes the
 * free-search limit real: without one of the account's own, nothing here does any work.
 */
export async function leadRoute<T>(
  request: Request,
  limiter: RateLimiter,
  schema: ZodType<T>,
  run: (body: T) => Promise<unknown>,
): Promise<Response> {
  const headers = noStoreHeaders();
  const account = await currentAccount(request);
  if (!account) return json({ error: "Sign in to use the lead finder.", code: "signed-out" }, headers, 401);
  if (!verifyRunToken(request.headers.get(RUN_HEADER), account.email)) {
    return json({ error: "This search has expired. Start a new one.", code: "run-expired" }, headers, 403);
  }
  if (!limiter.check(clientKey(request))) {
    return json({ error: "Too many lead searches. Wait a few minutes." }, headers, 429);
  }
  const body = await readJson(request, schema, headers);
  if (!body.ok) return body.response;
  try {
    return json(await run(body.data), headers);
  } catch (e) {
    if (e instanceof LeadsConfigError) return json({ error: e.message }, headers, 503);
    return json({ error: "The lead search failed. Try again." }, headers, 502);
  }
}
