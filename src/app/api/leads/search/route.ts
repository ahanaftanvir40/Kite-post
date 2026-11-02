import { leadRoute } from "@/lib/leads/route";
import { searchLimiter, searchSchema } from "@/lib/leads/schemas";
import { searchPlaces } from "@/lib/leads/serper";

export const maxDuration = 30;

export function POST(request: Request): Promise<Response> {
  return leadRoute(request, searchLimiter, searchSchema, async (b) => ({ places: await searchPlaces(b.query, b.location, b.page) }));
}
