import { describe, expect, it } from "vitest";
import {
  analyzeTemplate,
  buildValues,
  compactListItems,
  escapeHtml,
  findTokens,
  levenshtein,
  listFields,
  normalizeKey,
  renderMessage,
  renderTemplate,
  splitName,
  stripLineBreaks,
  suggestKey,
} from "@/lib/merge";

describe("normalizeKey", () => {
  it.each([
    ["First Name", "firstname"],
    ["first_name", "firstname"],
    ["FIRSTNAME", "firstname"],
    ["E-mail Address", "emailaddress"],
    ["  Company #1 ", "company1"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeKey(input)).toBe(expected);
  });
});

describe("findTokens", () => {
  it("finds simple tokens with positions", () => {
    const tokens = findTokens("Hi @firstname, welcome to @company!");
    expect(tokens.map((t) => t.raw)).toEqual(["firstname", "company"]);
    expect(tokens[0].start).toBe(3);
  });

  it("ignores email addresses", () => {
    expect(findTokens("write to john@gmail.com or a.b@x.io")).toEqual([]);
  });

  it("matches a token right after punctuation and at line start", () => {
    expect(findTokens("(@a) \n@b, \"@c\"").map((t) => t.raw)).toEqual(["a", "b", "c"]);
  });

  it("does not treat @123 or a lone @ as a token", () => {
    expect(findTokens("@123 and @ alone")).toEqual([]);
  });

  it("normalizes keys with underscores", () => {
    expect(findTokens("@first_name")[0].key).toBe("firstname");
  });
});

describe("levenshtein / suggestKey", () => {
  it("computes distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("suggests close keys only", () => {
    expect(suggestKey("frstname", ["firstname", "company"])).toBe("firstname");
    expect(suggestKey("zzzzzz", ["firstname", "company"])).toBeNull();
    expect(suggestKey("x", [])).toBeNull();
  });
});

describe("escape", () => {
  it("escapes HTML metacharacters", () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe(
      "&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;",
    );
  });

  it("strips CR/LF and collapses whitespace", () => {
    expect(stripLineBreaks("Hello\r\nBcc: evil@x.com")).toBe("Hello Bcc: evil@x.com");
    expect(stripLineBreaks("a\u2028b")).toBe("a b");
  });
});

describe("derived fields", () => {
  it("splits names", () => {
    expect(splitName("Ada Lovelace King")).toEqual({ first: "Ada", last: "Lovelace King" });
    expect(splitName("  Cher ")).toEqual({ first: "Cher", last: "" });
    expect(splitName("")).toEqual({ first: "", last: "" });
  });

  it("derives firstname and lastname from a Name column", () => {
    const headers = ["Name", "Email"];
    const values = buildValues(headers, { Name: "Grace Hopper", Email: "g@h.io" });
    expect(values).toMatchObject({ firstname: "Grace", lastname: "Hopper", name: "Grace Hopper" });
    expect(listFields(headers).map((f) => [f.key, f.derived])).toEqual([
      ["name", false],
      ["email", false],
      ["firstname", true],
      ["lastname", true],
    ]);
  });

  it("derives from `Full name`", () => {
    expect(buildValues(["Full name"], { "Full name": "Linus Torvalds" }).firstname).toBe("Linus");
  });

  it("does not override explicit first name column", () => {
    const headers = ["Name", "First Name"];
    const values = buildValues(headers, { Name: "Grace Hopper", "First Name": "Amazing" });
    expect(values.firstname).toBe("Amazing");
    expect(values.lastname).toBe("Hopper");
    expect(listFields(headers).filter((f) => f.derived).map((f) => f.key)).toEqual(["lastname"]);
  });

  it("keeps first column when headers collide after normalization", () => {
    const values = buildValues(["First Name", "first_name"], { "First Name": "A", first_name: "B" });
    expect(values.firstname).toBe("A");
  });

  it("skips empty headers and trims values", () => {
    const values = buildValues(["", "City"], { "": "x", City: "  Paris " });
    expect(values).toEqual({ city: "Paris" });
    expect(listFields(["", "City"]).map((f) => f.key)).toEqual(["city"]);
  });

  it("tolerates missing cells", () => {
    expect(buildValues(["City"], {}).city).toBe("");
  });
});

describe("renderTemplate", () => {
  const values = { firstname: "Ada", company: "Analytical <Engines>", empty: "" };

  it("replaces known tokens, leaves unknown ones", () => {
    const r = renderTemplate("Hi @firstname @nope", values);
    expect(r.text).toBe("Hi Ada @nope");
    expect(r.unknown).toEqual(["nope"]);
  });

  it("is case and symbol insensitive", () => {
    expect(renderTemplate("@FirstName @first_name", values).text).toBe("Ada Ada");
  });

  it("does not touch emails", () => {
    expect(renderTemplate("mail john@gmail.com", { gmail: "X" }).text).toBe("mail john@gmail.com");
  });

  it("escapes values only when asked", () => {
    expect(renderTemplate("@company", values).text).toBe("Analytical <Engines>");
    expect(renderTemplate("@company", values, { escapeValues: true }).text).toBe(
      "Analytical &lt;Engines&gt;",
    );
  });

  it("uses fallbacks for empty values and reports empties otherwise", () => {
    expect(renderTemplate("Hi @empty", values, { fallbacks: { empty: "there" } }).text).toBe(
      "Hi there",
    );
    const r = renderTemplate("Hi @empty", values);
    expect(r.text).toBe("Hi ");
    expect(r.empty).toEqual(["empty"]);
  });

  it("escapes fallbacks too", () => {
    expect(
      renderTemplate("@empty", values, { escapeValues: true, fallbacks: { empty: "<x>" } }).text,
    ).toBe("&lt;x&gt;");
  });

  it("handles repeated tokens and does not re-expand substituted text", () => {
    const r = renderTemplate("@a @a", { a: "@b", b: "no" });
    expect(r.text).toBe("@b @b");
  });
});

describe("renderMessage", () => {
  it("keeps subject plain, escapes the body, strips header injection", () => {
    const values = { firstname: "Ada\r\nBcc: x@y.z", company: "A&B" };
    const m = renderMessage("Hello @firstname", "<p>@company</p>", values);
    expect(m.subject).toBe("Hello Ada Bcc: x@y.z");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.html).toBe("<p>A&amp;B</p>");
  });

  it("merges empties and unknowns across subject and body", () => {
    const m = renderMessage("@a @zz", "@a @b", { a: "", b: "ok" });
    expect(m.empty).toEqual(["a"]);
    expect(m.unknown).toEqual(["zz"]);
  });

  it("applies fallbacks in both parts", () => {
    const m = renderMessage("Hi @firstname", "<p>Hi @firstname</p>", { firstname: "" }, { firstname: "there" });
    expect(m.subject).toBe("Hi there");
    expect(m.html).toBe("<p>Hi there</p>");
  });

  it("unwraps paragraphs inside list items so bullets stay tight in mail clients", () => {
    const body = "<p>Hi @firstname</p><ul><li><p>One @firstname</p></li><li><p>Two</p></li></ul><p>Bye</p>";
    const m = renderMessage("s", body, { firstname: "Ada" });
    expect(m.html).toBe("<p>Hi Ada</p><ul><li>One Ada</li><li>Two</li></ul><p>Bye</p>");
  });

  it("leaves list items with several paragraphs or no paragraph alone", () => {
    expect(compactListItems("<ul><li>Plain</li></ul>")).toBe("<ul><li>Plain</li></ul>");
    expect(compactListItems("<ul><li><p>A</p><p>B</p></li></ul>")).toBe("<ul><li><p>A</p><p>B</p></li></ul>");
  });
});

describe("analyzeTemplate", () => {
  const fields = listFields(["First Name", "Company", "Email"]);

  it("reports used and unknown tokens with suggestions", () => {
    const a = analyzeTemplate(["Hi @firstname", "<p>@frstname from @comany @zzzz</p>"], fields);
    expect(a.used).toEqual(["firstname"]);
    expect(a.unknown.map((u) => [u.key, u.suggestion])).toEqual([
      ["frstname", "firstname"],
      ["comany", "company"],
      ["zzzz", null],
    ]);
  });

  it("deduplicates unknown tokens", () => {
    expect(analyzeTemplate(["@bad @bad @Bad"], fields).unknown).toHaveLength(1);
  });

  it("returns nothing for token-free templates", () => {
    expect(analyzeTemplate(["plain"], fields)).toEqual({ used: [], unknown: [] });
  });
});
