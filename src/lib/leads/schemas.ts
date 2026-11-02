import { z } from "zod";
import { createRateLimiter } from "@/lib/rateLimit";
import { COUNTRIES } from "./countries";

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Enter a valid web address.");

export const planSchema = z.object({
  description: z.string().trim().min(10, "Describe your business in a sentence or two.").max(1000),
  productUrl: httpUrl.nullish().or(z.literal("").transform(() => null)),
});

export const searchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2, "Enter a city or area.").max(120),
  page: z.number().int().min(1).max(5),
});

export const emailsSchema = z.object({
  urls: z.array(httpUrl).min(1).max(6),
});

const kind = z.enum(["professors", "admissions", "funding"]);
const countryCode = z.enum(COUNTRIES.map((c) => c.code) as [string, ...string[]]);

export const academicSchema = z.object({
  kind,
  field: z.string().trim().min(2, "Enter what you want to study or research.").max(100),
  level: z.enum(["any", "masters", "phd", "postdoc"]),
  country: countryCode,
  university: z.string().trim().max(100),
  page: z.number().int().min(1).max(4),
});

export const peopleSchema = z.object({
  kind,
  country: countryCode,
  items: z
    .array(z.object({ url: httpUrl, title: z.string().max(300), snippet: z.string().max(600) }))
    .min(1)
    .max(6),
});

const TEN_MINUTES = 10 * 60 * 1000;
export const planLimiter = createRateLimiter(20, TEN_MINUTES);
export const searchLimiter = createRateLimiter(150, TEN_MINUTES);
export const emailsLimiter = createRateLimiter(80, TEN_MINUTES);
export const academicLimiter = createRateLimiter(120, TEN_MINUTES);
export const peopleLimiter = createRateLimiter(120, TEN_MINUTES);
