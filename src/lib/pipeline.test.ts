import { describe, expect, it } from "vitest";
import { mergeChunkSections } from "@/lib/pipeline";
import { assertResult } from "@/lib/validation";

describe("merge source-scoped LLM sections", () => {
  it("keeps repeated section names under their chapter and joins only continuations", () => {
    const value = (body: string) => assertResult({ sections: [{ title: "Tổng quan", blocks: [{ type: "paragraph", content: body }] }] });
    const sections = mergeChunkSections([
      { chunk: { title: "I. Kiến trúc API › A. Request" }, value: value("Request 1") },
      { chunk: { title: "I. Kiến trúc API › A. Request" }, value: value("Request 2") },
      { chunk: { title: "II. Cơ sở dữ liệu › A. Index" }, value: value("Index") },
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toContain("I. Kiến trúc API › A. Request");
    expect(sections[0].blocks).toHaveLength(2);
    expect(sections[1].title).toContain("II. Cơ sở dữ liệu › A. Index");
    expect(sections[1].blocks).toHaveLength(1);
  });
});
