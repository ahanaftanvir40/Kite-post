// Rebuilds src/lib/leads/universities.json: web domain -> university name, for the countries the
// student finder supports. Source: github.com/Hipo/university-domains-list (MIT).
// Run: node scripts/build-universities.mjs
import { writeFileSync } from "node:fs";

const SOURCE = "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const CODES = new Set("GB DE US CA AU NL SE CH FI DK NO IE FR AT BE HU TR NZ JP KR".split(" "));

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
const universities = await response.json();

const byDomain = {};
for (const u of universities) {
  if (!CODES.has(u.alpha_two_code)) continue;
  for (const domain of u.domains) {
    const key = domain.trim().toLowerCase();
    // First listing wins when two entries share a domain.
    if (key && !(key in byDomain)) byDomain[key] = u.name.trim();
  }
}

const sorted = Object.fromEntries(Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL("../src/lib/leads/universities.json", import.meta.url), `${JSON.stringify(sorted)}\n`);
console.log(`${Object.keys(sorted).length} domains written`);
