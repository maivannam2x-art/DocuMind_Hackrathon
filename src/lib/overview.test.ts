import { describe, expect, it } from "vitest";
import { fallbackOverview, summaryContext, validatedOverview } from "@/lib/overview";

describe("concise document overview", () => {
  const sections = Array.from({ length: 351 }, (_, index) => ({
    title: `${index + 1}. Mục kỹ thuật ${index + 1}`,
    summary: `Phân tích nội dung kỹ thuật của phần ${index + 1}, nguồn dữ liệu và phương án triển khai.`,
  }));

  it("bounds a large historical result to a readable lead and six titled points", () => {
    const overview = fallbackOverview(sections, "Tài liệu IT");
    expect(overview.lead.length).toBeLessThan(250);
    expect(overview.highlights).toHaveLength(6);
    expect(overview.highlights.at(-1)?.title).toContain("351");
  });

  it("keeps a bounded spread of section evidence for one synthesis request", () => {
    const context = summaryContext(sections);
    expect(context.length).toBeLessThanOrEqual(26000);
    expect(context).toContain("Mục kỹ thuật 1");
    expect(context).toContain("Mục kỹ thuật 351");
  });

  it("rejects malformed AI overview and bounds valid output", () => {
    expect(validatedOverview({ lead: "Rất ngắn", highlights: [] })).toBeNull();
    const valid = validatedOverview({ lead: "Tài liệu trình bày kiến trúc hệ thống và cách triển khai.".repeat(30), highlights: [
      { title: "Kiến trúc", detail: "Dữ liệu đi qua API." },
      { title: "Vận hành", detail: "Có kiểm soát lỗi." },
    ] });
    expect(valid?.lead.length).toBeLessThanOrEqual(481);
    expect(valid?.highlights).toHaveLength(2);
  });
});
