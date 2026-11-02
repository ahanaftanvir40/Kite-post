import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "@/features/merge/linkUrl";

describe("normalizeLinkUrl", () => {
  it("keeps web, mail and phone links as typed", () => {
    expect(normalizeLinkUrl("https://resumestart.ai/offer?a=1")).toBe("https://resumestart.ai/offer?a=1");
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeLinkUrl("mailto:team@resumestart.ai")).toBe("mailto:team@resumestart.ai");
    expect(normalizeLinkUrl("tel:+8801700000000")).toBe("tel:+8801700000000");
  });

  it("adds https to a bare address and mailto to an email", () => {
    expect(normalizeLinkUrl("resumestart.ai/offer")).toBe("https://resumestart.ai/offer");
    expect(normalizeLinkUrl("localhost:3000")).toBe("https://localhost:3000");
    expect(normalizeLinkUrl("team@resumestart.ai")).toBe("mailto:team@resumestart.ai");
  });

  it("trims whitespace and refuses empty or spaced input", () => {
    expect(normalizeLinkUrl("  example.com  ")).toBe("https://example.com");
    expect(normalizeLinkUrl("")).toBeNull();
    expect(normalizeLinkUrl("   ")).toBeNull();
    expect(normalizeLinkUrl("not a link")).toBeNull();
  });

  it("refuses script and data schemes", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("JavaScript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeLinkUrl("vbscript:x")).toBeNull();
  });
});
