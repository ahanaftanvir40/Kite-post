import { describe, expect, it, vi } from "vitest";
import { buildQuery, cleanName, extractPeople, universityDomain } from "@/lib/leads/academic";
import { COUNTRY_BY_CODE } from "@/lib/leads/countries";
import { homepageName, nameFromText, tidyName, universityName } from "@/lib/leads/universities";
import { addPeople, peopleToXlsx } from "@/features/leads/study";

const uk = COUNTRY_BY_CODE.get("uk")!;
const us = COUNTRY_BY_CODE.get("us")!;

describe("cleanName", () => {
  it("strips titles and rejects non-names", () => {
    expect(cleanName("Prof. Dr. Reinhard Heckel")).toBe("Reinhard Heckel");
    expect(cleanName("Ludwig van Beethoven")).toBe("Ludwig van Beethoven");
    expect(cleanName("Department of Computer Science")).toBeNull();
    expect(cleanName("People")).toBeNull();
    expect(cleanName("Renewable Energy Systems M.E.")).toBeNull();
    expect(cleanName("Peter P. Marra")).toBe("Peter P. Marra");
    expect(cleanName("Meet Dr Isabella Fiorello")).toBe("Isabella Fiorello");
  });
});

describe("universityDomain", () => {
  it("collapses departments to the university", () => {
    expect(universityDomain("www.cs.ox.ac.uk", "ac.uk")).toBe("ox.ac.uk");
    expect(universityDomain("atmos.uw.edu", "edu")).toBe("uw.edu");
    expect(universityDomain("www.tum.de", "de")).toBe("tum.de");
  });
});

describe("universityName", () => {
  it("uses the bundled list and tidies it", () => {
    expect(universityName("ox.ac.uk", "")).toBe("University of Oxford");
    expect(universityName("ethz.ch", "")).toBe("ETH Zurich");
    expect(tidyName("University College London, University of London")).toBe("University College London");
  });
  it("reads the name off the page for a university the list lacks", () => {
    const page = "Welcome to the University of Reading. The University of Reading is in Berkshire. Visit the University of Oxford.";
    expect(universityName("reading.ac.uk", page)).toBe("University of Reading");
    expect(nameFromText("uea.ac.uk", "University of Oxford only")).toBeNull();
  });
  it("falls back to the domain rather than a blank", () => {
    expect(universityName("nowhere.ac.uk", "no names here")).toBe("nowhere.ac.uk");
  });
  it("resolves the university on a profile page that is not in the list", () => {
    const uk = COUNTRY_BY_CODE.get("uk")!;
    const [p] = extractPeople("professors", { title: "Kim Watson - University of Reading", url: "https://research.reading.ac.uk/kim-watson/", snippet: "Professor of Soil Science at the University of Reading" }, "", uk);
    expect(p).toMatchObject({ university: "University of Reading", domain: "reading.ac.uk" });
  });
});

describe("university from the email, and from the homepage", () => {
  it("credits a person to the university in their email, not the site hosting the page", () => {
    const uk = COUNTRY_BY_CODE.get("uk")!;
    const [p] = extractPeople("professors", { title: "Dr Ada Lovelace - Lecturer", url: "https://www.jobs.ac.uk/staff/ada-lovelace", snippet: "Lecturer in Mathematics" }, "Contact ada.lovelace@ox.ac.uk", uk);
    expect(p).toMatchObject({ domain: "ox.ac.uk", university: "University of Oxford" });
  });
  it("reads the name from the homepage once per domain, and falls back to null", async () => {
    const scrape = vi.fn(async () => ({ text: "", markdown: "# University of Brightwater\nWelcome to the University of Brightwater" }));
    expect(await homepageName("brightwater.ac.uk", scrape)).toBe("University of Brightwater");
    expect(await homepageName("brightwater.ac.uk", scrape)).toBe("University of Brightwater");
    expect(scrape).toHaveBeenCalledTimes(1);
    const down = vi.fn(async () => {
      throw new Error("blocked");
    });
    expect(await homepageName("unreachable.ac.uk", down)).toBeNull();
  });
});

describe("buildQuery", () => {
  it("scopes to the country and adds the level", () => {
    expect(buildQuery("professors", "machine learning", "phd", uk, "")).toBe('site:ac.uk "machine learning" professor PhD email -filetype:pdf');
    expect(buildQuery("admissions", "law", "any", us, "Yale")).toContain('"Yale" "law"');
  });
});

describe("extractPeople", () => {
  it("pairs each name with its email in a staff table", () => {
    const md = `| [David Barber](https://profiles.ucl.ac.uk/9842-david-barber) | Director
Professor of Machine Learning | <david.barber@ucl.ac.uk> |
| [Carlo Ciliberto](https://profiles.ucl.ac.uk/60171-carlo-ciliberto) | Deputy Director
Associate Professor in Machine Learning | <c.ciliberto@ucl.ac.uk> |
| Pontus Stenetorp | Professor in NLP | <p.stenetorp@cs.ucl.ac.uk> |
Admin: ai-centre@ucl.ac.uk`;
    const people = extractPeople("professors", { title: "People | UCL AI", url: "https://www.ucl.ac.uk/ai/people", snippet: "" }, md, uk);
    expect(people.map((p) => [p.name, p.email])).toEqual([
      ["David Barber", "david.barber@ucl.ac.uk"],
      ["Carlo Ciliberto", "c.ciliberto@ucl.ac.uk"],
      ["Pontus Stenetorp", "p.stenetorp@cs.ucl.ac.uk"],
    ]);
    expect(people[0].role).toContain("Professor");
    expect(people[0].greeting).toBe("Dear Professor Barber,");
    expect(people[0].url).toBe("https://profiles.ucl.ac.uk/9842-david-barber");
    expect(people[0]).toMatchObject({ university: "University College London", domain: "ucl.ac.uk", country: "United Kingdom" });
  });

  it("reads a single profile, with the name from the page title and obfuscated email", () => {
    const md = "Associate Professor of Statistics. Contact: reinhard.heckel [at] tum.de or office@tum.de";
    const country = COUNTRY_BY_CODE.get("de")!;
    const [p] = extractPeople("professors", { title: "Prof. Dr. Reinhard Heckel - TUM", url: "https://www.professoren.tum.de/en/heckel-reinhard", snippet: "" }, md, country);
    expect(p).toMatchObject({ name: "Reinhard Heckel", email: "reinhard.heckel@tum.de", domain: "tum.de", country: "Germany" });
    expect(p.university).toMatch(/München|Munich/);
  });

  it("lists a profile without a public email, but not a random page", () => {
    const profile = extractPeople("professors", { title: "Yarin Gal - Oxford", url: "https://www.cs.ox.ac.uk/people/yarin.gal/", snippet: "Associate Professor of Machine Learning" }, "No contact here.", uk);
    expect(profile).toMatchObject([{ name: "Yarin Gal", email: "" }]);
    expect(extractPeople("professors", { title: "News and events", url: "https://www.cs.ox.ac.uk/news", snippet: "" }, "nothing", uk)).toEqual([]);
  });

  it("returns the office inbox for admissions pages and ignores outside domains", () => {
    const md = "Questions? gradadmissions@ed.ac.uk or helpdesk@gmail.com";
    const [p] = extractPeople("admissions", { title: "Apply | Edinburgh", url: "https://www.ed.ac.uk/apply", snippet: "How to apply" }, md, uk);
    expect(p).toMatchObject({ email: "gradadmissions@ed.ac.uk", greeting: "Dear Admissions Team,", university: "University of Edinburgh", country: "United Kingdom" });
    expect(p.otherEmails).toEqual([]);
  });
});

describe("addPeople and export", () => {
  const person = (email: string, name: string) => ({ name, greeting: "", role: "", university: "University College London", domain: "ucl.ac.uk", country: "United Kingdom", email, otherEmails: [], about: "", url: "https://x" });
  it("dedupes by email and stops at the limit", () => {
    const into = [person("a@ucl.ac.uk", "A B")];
    addPeople(into, [person("a@ucl.ac.uk", "A B"), person("c@ucl.ac.uk", "C D"), person("e@ucl.ac.uk", "E F")], 2);
    expect(into.map((p) => p.email)).toEqual(["a@ucl.ac.uk", "c@ucl.ac.uk"]);
  });
  it("writes an xlsx", () => {
    const bytes = peopleToXlsx([person("a@ucl.ac.uk", "A B")], "ML");
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
