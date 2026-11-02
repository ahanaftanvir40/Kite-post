import { describe, expect, it } from "vitest";
import {
  batchSizeProblem,
  batchSizes,
  batchToXlsx,
  createZip,
  crc32,
  parseSpreadsheet,
  splitIntoBatches,
  tabFiles,
} from "@/lib/spreadsheet";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ Email: `p${i}@x.com`, Name: `Person ${i}` }));

describe("batchSizes", () => {
  it("splits evenly", () => expect(batchSizes(100, 20)).toEqual([20, 20, 20, 20, 20]));
  it("keeps the remainder in a smaller last batch", () => expect(batchSizes(110, 20)).toEqual([20, 20, 20, 20, 20, 10]));
  it("handles nothing to split", () => expect(batchSizes(0, 20)).toEqual([]));
});

describe("batchSizeProblem", () => {
  it("accepts 5 and up", () => expect(batchSizeProblem(5, 100)).toBeNull());
  it("rejects under 5", () => expect(batchSizeProblem(4, 100)).toMatch(/smallest batch is 5/));
  it("rejects fractions and blanks", () => {
    expect(batchSizeProblem(7.5, 100)).toMatch(/whole number/);
    expect(batchSizeProblem(Number.NaN, 100)).toMatch(/whole number/);
  });
  it("rejects a size that would not split anything", () => {
    expect(batchSizeProblem(100, 100)).toMatch(/below 100/);
    expect(batchSizeProblem(500, 100)).toMatch(/below 100/);
  });
});

describe("splitIntoBatches", () => {
  it("keeps every row once, in order", () => {
    const input = rows(47);
    const batches = splitIntoBatches(input, 20, "Leads");
    expect(batches.map((b) => b.rows.length)).toEqual([20, 20, 7]);
    expect(batches.flatMap((b) => b.rows)).toEqual(input);
  });

  it("names batches and files", () => {
    const [first, , third] = splitIntoBatches(rows(47), 20, "Leads");
    expect(first.name).toBe("Leads - batch 1 of 3");
    expect(third.fileName).toBe("Leads - batch 3 of 3.xlsx");
  });

  it("strips characters that break file names and shortens long names to fit a list name", () => {
    const [b] = splitIntoBatches(rows(10), 5, `a/b:c${"x".repeat(200)}`);
    expect(b.name.length).toBeLessThanOrEqual(80);
    expect(b.name).toMatch(/ - batch 1 of 2$/);
    expect(b.fileName).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe("batchToXlsx", () => {
  it("writes a file the importer reads back with the same headers and rows", () => {
    const headers = ["Email", "Name"];
    const data = rows(6);
    const bytes = batchToXlsx(headers, data, "Leads - batch 1 of 2");
    const parsed = parseSpreadsheet("batch.xlsx", bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(parsed.sheets[0].headers).toEqual(headers);
    expect(parsed.sheets[0].rows).toEqual(data);
  });
});

describe("createZip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("lists every file in the archive", () => {
    const zip = createZip([
      { name: "a.xlsx", data: new Uint8Array([1, 2, 3]) },
      { name: "b.xlsx", data: new Uint8Array([4, 5]) },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    // The central directory starts where the end record says it does.
    expect(view.getUint32(view.getUint32(end + 16, true), true)).toBe(0x02014b50);
  });
});

describe("tabFiles", () => {
  const tab = (index: number, name: string) => ({ index, sheet: { name, headers: ["Email"], rows: [{ Email: "a@x.com" }] } });

  it("names each tab file after the workbook and the tab", () => {
    const files = tabFiles("Win-Back (1).xlsx", [tab(0, "Has resume"), tab(2, "All users")]);
    expect(files.map((f) => f.name)).toEqual(["Win-Back (1) - Has resume", "Win-Back (1) - All users"]);
    expect(files.map((f) => f.fileName)).toEqual(["Win-Back (1) - Has resume.xlsx", "Win-Back (1) - All users.xlsx"]);
    expect(files.map((f) => f.index)).toEqual([0, 2]);
  });

  it("keeps names unique and file-safe, and short enough to save", () => {
    const files = tabFiles("a/b.xlsx", [tab(0, "Q1: leads"), tab(1, "q1: leads"), tab(2, "x".repeat(200))]);
    expect(files[0]?.name).toBe("a b - Q1 leads");
    expect(files[1]?.name).toBe("a b - q1 leads (2)");
    expect(files[2]?.name.length).toBeLessThanOrEqual(80);
  });
});
