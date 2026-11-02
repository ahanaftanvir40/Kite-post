import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  buildRecipients,
  cleanHeaders,
  defaultExcluded,
  detectEmailColumn,
  isValidEmail,
  MAX_FILE_BYTES,
  MAX_ROWS,
  normalizeEmail,
  parseSpreadsheet,
  SAMPLE_CSV,
  SpreadsheetError,
} from "@/lib/spreadsheet";

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

function xlsxBuffer(sheets: Record<string, unknown[][]>, bookType: "xlsx" | "biff8" = "xlsx"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  const out = XLSX.write(wb, { type: "array", bookType }) as ArrayBuffer;
  return out;
}

describe("isValidEmail", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.com", "x_y@my-site.io"])("accepts %s", (e) => {
    expect(isValidEmail(e)).toBe(true);
  });

  it.each([
    "",
    "plain",
    "a@b",
    "a b@c.com",
    "a@@b.com",
    ".a@b.com",
    "a..b@c.com",
    "a@-b.com",
    "<a@b.com>",
    "a@b.com, c@d.com",
    `${"x".repeat(65)}@b.com`,
  ])("rejects %j", (e) => {
    expect(isValidEmail(e)).toBe(false);
  });

  it("normalizes", () => {
    expect(normalizeEmail("  A@B.Com ")).toBe("a@b.com");
  });
});

describe("cleanHeaders", () => {
  it("fills blanks and dedupes case-insensitively", () => {
    expect(cleanHeaders(["Name", "", "name", "Name", null, "\uFEFFEmail"])).toEqual([
      "Name",
      "Column 2",
      "name (2)",
      "Name (3)",
      "Column 5",
      "Email",
    ]);
  });
});

describe("parseSpreadsheet", () => {
  it("parses the sample csv", () => {
    const wb = parseSpreadsheet("sample.csv", enc(SAMPLE_CSV));
    const sheet = wb.sheets[0];
    expect(sheet.headers).toEqual(["First Name", "Last Name", "Email", "Company"]);
    expect(sheet.rows).toHaveLength(4);
    expect(sheet.rows[0]).toMatchObject({ "First Name": "Ada", Email: "ada@example.com" });
    expect(sheet.rows[3]).toMatchObject({ "First Name": "Ahanaf", Email: "ahanaf.tanvir40@gmail.com" });
    expect(sheet.rowNumbers).toEqual([2, 3, 4, 5]);
  });

  it("strips a UTF-8 BOM and keeps non-ASCII text", () => {
    const wb = parseSpreadsheet("a.csv", enc("\uFEFFName,Email\nZoë Müller,z@x.io\n"));
    expect(wb.sheets[0].headers[0]).toBe("Name");
    expect(wb.sheets[0].rows[0].Name).toBe("Zoë Müller");
  });

  it("handles quoted commas and embedded newlines in csv", () => {
    const wb = parseSpreadsheet("a.csv", enc('Name,Note\n"Smith, J","line1\nline2"\n'));
    expect(wb.sheets[0].rows[0]).toEqual({ Name: "Smith, J", Note: "line1\nline2" });
  });

  it("skips blank rows and leading blank rows, keeping true row numbers", () => {
    const wb = parseSpreadsheet("a.csv", enc("\n\nName,Email\n\nAda,a@b.co\n,\nGrace,g@b.co\n"));
    const s = wb.sheets[0];
    expect(s.headers).toEqual(["Name", "Email"]);
    expect(s.rows.map((r) => r.Name)).toEqual(["Ada", "Grace"]);
    expect(s.rowNumbers).toEqual([5, 7]);
  });

  it("parses xlsx with multiple sheets and drops empty ones", () => {
    const buf = xlsxBuffer({
      People: [
        ["Name", "Email"],
        ["Ada", "ada@x.io"],
      ],
      Empty: [],
      More: [
        ["Email"],
        ["m@x.io"],
      ],
    });
    const wb = parseSpreadsheet("book.xlsx", buf);
    expect(wb.sheets.map((s) => s.name)).toEqual(["People", "More"]);
    expect(wb.sheets[0].rows[0]).toEqual({ Name: "Ada", Email: "ada@x.io" });
  });

  it("parses legacy .xls", () => {
    const buf = xlsxBuffer({ S: [["Name", "Email"], ["Ada", "ada@x.io"]] }, "biff8");
    const wb = parseSpreadsheet("old.xls", buf);
    expect(wb.sheets[0].rows[0].Email).toBe("ada@x.io");
  });

  it("formats numbers and dates as displayed", () => {
    const ws = XLSX.utils.aoa_to_sheet([["Name", "Joined", "Score"], ["Ada", new Date(Date.UTC(2024, 0, 15)), 0.5]], {
      cellDates: true,
    });
    ws["B2"].z = "yyyy-mm-dd";
    ws["C2"].z = "0%";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "S");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer;
    const row = parseSpreadsheet("d.xlsx", buf).sheets[0].rows[0];
    expect(row.Joined).toBe("2024-01-15");
    expect(row.Score).toBe("50%");
  });

  it("handles duplicate and empty headers", () => {
    const wb = parseSpreadsheet("a.csv", enc("Name,,Name\nA,B,C\n"));
    expect(wb.sheets[0].headers).toEqual(["Name", "Column 2", "Name (2)"]);
  });

  it("truncates beyond MAX_ROWS", () => {
    const lines = ["Email"];
    for (let i = 0; i < MAX_ROWS + 5; i++) lines.push(`u${i}@x.io`);
    const s = parseSpreadsheet("big.csv", enc(lines.join("\n"))).sheets[0];
    expect(s.rows).toHaveLength(MAX_ROWS);
    expect(s.truncated).toBe(true);
  });

  it("rejects unsupported types, oversize and empty files", () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as SpreadsheetError).code;
      }
      return null;
    };
    expect(code(() => parseSpreadsheet("a.pdf", enc("x")))).toBe("unsupported-type");
    expect(code(() => parseSpreadsheet("a", enc("x")))).toBe("unsupported-type");
    expect(code(() => parseSpreadsheet("a.csv", new ArrayBuffer(MAX_FILE_BYTES + 1)))).toBe("too-large");
    expect(code(() => parseSpreadsheet("a.csv", enc("")))).toBe("empty");
    expect(code(() => parseSpreadsheet("a.csv", enc("\n\n , \n")))).toBe("empty");
  });
});

describe("detectEmailColumn", () => {
  const rows = (...r: Record<string, string>[]) => r;

  it("prefers a header named like email", () => {
    expect(
      detectEmailColumn(["Name", "E-mail", "Alt"], rows({ Name: "A", "E-mail": "a@b.co", Alt: "z@y.io" })),
    ).toBe("E-mail");
  });

  it("skips an email-named header with no valid values and falls back to content", () => {
    expect(
      detectEmailColumn(["Email", "Contact"], rows({ Email: "n/a", Contact: "c@d.io" }, { Email: "", Contact: "e@f.io" })),
    ).toBe("Contact");
  });

  it("detects by content when headers give no hint", () => {
    expect(detectEmailColumn(["Who", "Where"], rows({ Who: "a", Where: "a@b.co" }, { Who: "b", Where: "b@b.co" }))).toBe(
      "Where",
    );
  });

  it("returns null when nothing looks like email", () => {
    expect(detectEmailColumn(["A", "B"], rows({ A: "x", B: "y" }))).toBeNull();
  });

  it("uses the header hint when there are no rows", () => {
    expect(detectEmailColumn(["Name", "Email"], [])).toBe("Email");
    expect(detectEmailColumn(["Name"], [])).toBeNull();
  });
});

describe("buildRecipients", () => {
  const sheet = parseSpreadsheet(
    "a.csv",
    enc("Name,Email\nAda Lovelace,ada@x.io\nBad,not-an-email\nNone,\nDup,ADA@x.io\nGrace Hopper,grace@x.io\n"),
  ).sheets[0];

  it("flags invalid, empty and duplicate rows", () => {
    const r = buildRecipients(sheet, "Email");
    expect(r.map((x) => x.issues)).toEqual([[], ["invalid-email"], ["empty-email"], ["duplicate"], []]);
    expect(r[0].values.firstname).toBe("Ada");
    expect(r[4].rowNumber).toBe(6);
  });

  it("excludes flagged rows by default", () => {
    const r = buildRecipients(sheet, "Email");
    expect([...defaultExcluded(r)].sort()).toEqual(["r1", "r2", "r3"]);
  });

  it("re-flags when the email column changes", () => {
    const r = buildRecipients(sheet, "Name");
    expect(r.every((x) => x.issues.includes("invalid-email"))).toBe(true);
  });
});
