import { findPeople } from "@/lib/leads/academic";
import { leadRoute } from "@/lib/leads/route";
import { peopleLimiter, peopleSchema } from "@/lib/leads/schemas";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return leadRoute(request, peopleLimiter, peopleSchema, async (b) => ({ people: await findPeople(b.kind, b.country, b.items) }));
}
