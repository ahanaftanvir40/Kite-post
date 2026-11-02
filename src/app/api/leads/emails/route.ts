import { leadRoute } from "@/lib/leads/route";
import { emailsLimiter, emailsSchema } from "@/lib/leads/schemas";
import { findEmails } from "@/lib/leads/serper";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return leadRoute(request, emailsLimiter, emailsSchema, async (b) => ({ results: await Promise.all(b.urls.map(findEmails)) }));
}
