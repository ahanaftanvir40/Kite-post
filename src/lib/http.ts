import type { ZodType } from "zod";
import { firstIssue } from "@/lib/validation/schemas";

export const MAX_BODY_BYTES = 1_500_000;

export function noStoreHeaders(): Headers {
  return new Headers({ "Cache-Control": "no-store" });
}

export function json(body: unknown, headers: Headers, status = 200): Response {
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Read, size-limit and validate a JSON body. Never echoes the body back. */
export async function readJson<T>(request: Request, schema: ZodType<T>, headers: Headers): Promise<BodyResult<T>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: "That request is too large." }, headers, 413) };
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: json({ error: "Could not read the request." }, headers, 400) };
  }
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: "That request is too large." }, headers, 413) };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, response: json({ error: "Request body must be JSON." }, headers, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: json({ error: firstIssue(parsed.error) }, headers, 400) };
  }
  return { ok: true, data: parsed.data };
}
