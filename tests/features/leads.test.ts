import { describe, expect, it } from "vitest";
import { extractEmails, findContactUrl } from "@/lib/leads/emails";
import { addUnique, leadsToXlsx, type Lead } from "@/features/leads/run";

describe("extractEmails", () => {
  it("reads mailto links and plain text, drops junk, ranks same-site inboxes first", () => {
    const page = `
      [Mail us](mailto:Info@Acme-Dental.com?subject=Website%20Lead)
      Press: press@othersite.org  logo@2x.png  you@example.com  noreply@acme-dental.com
      Dr Smith: smith@acme-dental.com.
    `;
    expect(extractEmails(page, "https://www.acme-dental.com")).toEqual(["info@acme-dental.com", "smith@acme-dental.com", "press@othersite.org"]);
  });

  it("returns nothing for a page without emails", () => {
    expect(extractEmails("Call us today!", "https://a.com")).toEqual([]);
  });
});

describe("findContactUrl", () => {
  it("picks a same-site contact link only", () => {
    const md = "[Other](https://other.com/contact) [Contact](https://a.com/contact-us)";
    expect(findContactUrl(md, "https://www.a.com")).toBe("https://a.com/contact-us");
    expect(findContactUrl("[x](https://other.com/contact)", "https://a.com")).toBeNull();
  });
});

describe("addUnique", () => {
  const place = (cid: string, title: string, website: string | null) => ({ cid, title, website, address: "", category: "", rating: null, ratingCount: null });
  it("skips repeated listings and websites, and stops at the limit", () => {
    const leads: Lead[] = [];
    addUnique(leads, [place("1", "A", "https://a.com"), place("1", "A again", "https://a.com"), place("2", "A branch", "https://www.a.com/x"), place("3", "B", null), place("4", "C", "https://c.com")], "q", 3);
    expect(leads.map((l) => l.name)).toEqual(["A", "B", "C"]);
  });
});

describe("leadsToXlsx", () => {
  it("produces an xlsx file", () => {
    const bytes = leadsToXlsx([{ id: "1", name: "A", category: "c", address: "x", website: null, emails: ["a@a.com", "b@a.com"], rating: 4.5, ratingCount: 10, query: "q" }]);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });
});
