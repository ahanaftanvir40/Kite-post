import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadPost, startLeadRun } from "@/features/leads/api";
import { runStudySearch } from "@/features/leads/study";
import { contactKey, studyKey } from "@/lib/leads/studyKey";

vi.mock("@/features/leads/api", async (orig) => ({ ...(await orig<typeof import("@/features/leads/api")>()), startLeadRun: vi.fn(), leadPost: vi.fn() }));

const base = { kind: "professors" as const, field: "Machine learning", level: "phd" as const, countries: ["uk", "de"], university: "" };
const person = (email: string, name = "A B", domain = "ox.ac.uk") => ({ name, greeting: "", role: "", university: "", domain, country: "", email, otherEmails: [], about: "", url: "" });

describe("studyKey", () => {
  it("ignores case, spacing, and the order countries were picked in", () => {
    expect(studyKey({ ...base, field: "  MACHINE   learning ", countries: ["de", "uk", "uk"] })).toBe(studyKey(base));
  });
  it("tells different searches apart", () => {
    const k = studyKey(base);
    expect(studyKey({ ...base, field: "physics" })).not.toBe(k);
    expect(studyKey({ ...base, level: "masters" })).not.toBe(k);
    expect(studyKey({ ...base, kind: "funding" })).not.toBe(k);
    expect(studyKey({ ...base, countries: ["uk"] })).not.toBe(k);
    expect(studyKey({ ...base, university: "Oxford" })).not.toBe(k);
  });
});

describe("contactKey", () => {
  it("matches emails regardless of case, and no-email contacts by name at the university", () => {
    expect(contactKey(person("A@OX.AC.UK"))).toBe("a@ox.ac.uk");
    expect(contactKey(person("", "Ada Lovelace", "ox.ac.uk"))).toBe("ox.ac.uk|ada lovelace");
  });
});

describe("a repeat search carries on instead of crawling again", () => {
  const web = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ url: `https://${tag}${i}.ac.uk/p`, title: "t", snippet: "s" }));
  const peopleFor = (items: { url: string }[]) => items.map((r) => person(`${new URL(r.url).hostname.split(".")[0]}@x.ac.uk`, new URL(r.url).hostname));

  function fakeApi() {
    const calls = { search: [] as { country: string; page: number }[], read: [] as string[] };
    vi.mocked(leadPost).mockImplementation(async (url: string, body: unknown) => {
      const b = body as { country: string; page: number; items: { url: string }[] };
      if (url === "/api/leads/academic") {
        calls.search.push({ country: b.country, page: b.page });
        // Two result pages of 4, then nothing.
        return { results: b.page <= 2 ? web(4, `p${b.page}r`) : [] };
      }
      calls.read.push(...b.items.map((i) => i.url));
      return { people: peopleFor(b.items) };
    });
    return calls;
  }
  const input = { kind: "professors" as const, field: "ml", level: "any" as const, countries: ["uk"], university: "", target: 4 };

  beforeEach(() => {
    vi.mocked(startLeadRun).mockResolvedValue({ token: "t", quota: { remaining: 1, limit: 2 } });
  });

  it("first search reads page 1 and records how far it got", async () => {
    const calls = fakeApi();
    const done = await runStudySearch(input, new AbortController().signal, () => {});
    expect(calls.search).toEqual([{ country: "uk", page: 1 }]);
    expect(done.people).toHaveLength(4);
    expect(done.crawl.pages).toEqual({ uk: 1 });
    expect(done.crawl.urls).toHaveLength(4);
  });

  it("the next search starts after it: no repeat pages fetched, no repeat people", async () => {
    const first = await (async () => {
      fakeApi();
      return runStudySearch(input, new AbortController().signal, () => {});
    })();
    const calls = fakeApi();
    const next = await runStudySearch({ ...input, previous: { contacts: first.people.map(contactKey), crawl: first.crawl } }, new AbortController().signal, () => {});

    expect(calls.search[0]).toEqual({ country: "uk", page: 2 });
    expect(calls.read.every((u) => !first.crawl.urls.includes(u))).toBe(true);
    expect(next.people).toHaveLength(4);
    const before = new Set(first.people.map(contactKey));
    expect(next.people.some((p) => before.has(contactKey(p)))).toBe(false);
    expect(next.crawl.pages).toEqual({ uk: 2 });
  });

  it("does not skip unread people: a page cut short by the target is read again next time", async () => {
    fakeApi();
    const first = await runStudySearch({ ...input, target: 2 }, new AbortController().signal, () => {});
    expect(first.people).toHaveLength(2);
    expect(first.crawl.pages.uk ?? 0).toBe(0);

    const calls = fakeApi();
    const next = await runStudySearch({ ...input, target: 2, previous: { contacts: first.people.map(contactKey), crawl: first.crawl } }, new AbortController().signal, () => {});
    expect(calls.search[0]).toEqual({ country: "uk", page: 1 });
    expect(next.people).toHaveLength(2);
    expect(next.people.some((p) => first.people.some((q) => contactKey(q) === contactKey(p)))).toBe(false);
  });

  it("stops quietly when a country has no more results", async () => {
    fakeApi();
    const done = await runStudySearch({ ...input, target: 40, previous: { contacts: [], crawl: { pages: { uk: 2 }, urls: [] } } }, new AbortController().signal, () => {});
    expect(done.people).toEqual([]);
    expect(done.phase).toBe("done");
  });
});
