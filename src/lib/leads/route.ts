import type { ZodType } from "zod";
import { json, noStoreHeaders, readJson } from "@/lib/http";
import type { RateLimiter } from "@/lib/rateLimit";
import { clientKey } from "@/lib/rateLimit";
import { LeadsConfigError } from "./serper";

/** Shared shell for the lead-finder routes: rate limit, validate, run, map errors. */
export async function leadRoute<T>(
  request: Request,
  limiter: RateLimiter,
  schema: ZodType<T>,
  run: (body: T) => Promise<unknown>,
): Promise<Response> {
  const headers = noStoreHeaders();
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
