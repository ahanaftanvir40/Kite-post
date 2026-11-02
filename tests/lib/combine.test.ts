import { describe, expect, it } from "vitest";
import { combineSheets, MAX_ROWS, SOURCE_COLUMN, type SheetData } from "@/lib/spreadsheet";

function sheet(name: string, headers: string[], rows: string[][]): SheetData {
  return {
    name,
    headers,
    rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
    rowNumbers: rows.map((_, i) => i + 2),
    truncated: false,
  };
}

describe("combineSheets", () => {
  const a = sheet("Has resume", ["Email", "Name"], [["a@x.com", "A"], ["b@x.com", "B"]]);
  const b = sheet("Lapsed", ["email", "Name", "Plan"], [["c@x.com", "C", "pro"]]);

  it("returns a single tab untouched", () => {
    expect(combineSheets([a], { addSource: true })).toBe(a);
  });

  it("stacks rows, lining columns up by name regardless of case", () => {
    const out = combineSheets([a, b], { addSource: false });
    expect(out.headers).toEqual(["Email", "Name", "Plan"]);
    expect(out.rows).toEqual([
      { Email: "a@x.com", Name: "A", Plan: "" },
      { Email: "b@x.com", Name: "B", Plan: "" },
      { Email: "c@x.com", Name: "C", Plan: "pro" },
    ]);
    expect(out.rowNumbers).toEqual([2, 3, 4]);
  });

  it("can record which tab each row came from", () => {
    const out = combineSheets([a, b], { addSource: true });
    expect(out.headers).toEqual(["Email", "Name", "Plan", SOURCE_COLUMN]);
    expect(out.rows.map((r) => r[SOURCE_COLUMN])).toEqual(["Has resume", "Has resume", "Lapsed"]);
  });

  it("does not clash with a column already called Source tab", () => {
    const own = sheet("X", ["Email", SOURCE_COLUMN], [["a@x.com", "mine"]]);
    const out = combineSheets([own, a], { addSource: true });
    expect(out.headers).toContain(`${SOURCE_COLUMN} (2)`);
    expect(out.rows[0][SOURCE_COLUMN]).toBe("mine");
    expect(out.rows[0][`${SOURCE_COLUMN} (2)`]).toBe("X");
  });

  it("stops at the row limit and says so", () => {
    const big = sheet("Big", ["Email"], Array.from({ length: MAX_ROWS - 1 }, (_, i) => [`p${i}@x.com`]));
    const out = combineSheets([big, a], { addSource: false });
    expect(out.rows).toHaveLength(MAX_ROWS);
    expect(out.truncated).toBe(true);
  });
});
