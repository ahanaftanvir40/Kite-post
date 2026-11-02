import { searchAcademic } from "@/lib/leads/academic";
import { leadRoute } from "@/lib/leads/route";
import { academicLimiter, academicSchema } from "@/lib/leads/schemas";

export const maxDuration = 30;

export function POST(request: Request): Promise<Response> {
  return leadRoute(request, academicLimiter, academicSchema, async (b) => ({
    results: await searchAcademic(b.kind, b.field, b.level, b.country, b.university, b.page),
  }));
}
