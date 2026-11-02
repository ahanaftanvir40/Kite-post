import { planLeads } from "@/lib/leads/plan";
import { leadRoute } from "@/lib/leads/route";
import { planLimiter, planSchema } from "@/lib/leads/schemas";

export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return leadRoute(request, planLimiter, planSchema, (b) => planLeads(b.description, b.productUrl ?? null));
}
