import { z } from "zod";
import { json, noStoreHeaders, readJson } from "@/lib/http";
import { studyHistorySchema, studyParamsSchema } from "@/lib/leads/schemas";
import { studyKey } from "@/lib/leads/studyKey";
import { authorize, guarded } from "@/lib/saved/guard";

const lookupSchema = studyParamsSchema.extend({ countries: z.string().transform((v) => v.split(",").filter(Boolean)).pipe(studyParamsSchema.shape.countries) });

/** The earlier download that matches these settings, if there is one. Reads only the signed-in account's own. */
export async function GET(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = lookupSchema.safeParse({ university: "", ...query });
  if (!parsed.success) return json({ error: "Those search settings are not valid." }, headers, 400);
  const found = await guarded(headers, () => access.store.getStudySearch(access.owner, studyKey(parsed.data)));
  if (!found.ok) return found.response;
  return json({ previous: found.value }, headers);
}

/** Remember that a file of student contacts was downloaded, so a repeat search can be spotted. */
export async function POST(request: Request): Promise<Response> {
  const headers = noStoreHeaders();
  const access = await authorize(request, headers);
  if (!access.ok) return access.response;
  const body = await readJson(request, studyHistorySchema, headers);
  if (!body.ok) return body.response;
  const { params, contacts, crawl } = body.data;
  const saved = await guarded(headers, () => access.store.saveStudySearch(access.owner, { key: studyKey(params), params, contacts, crawl }));
  if (!saved.ok) return saved.response;
  return json({ downloads: saved.value.downloads, lastDownloadedAt: saved.value.lastDownloadedAt }, headers);
}
