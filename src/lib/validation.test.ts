import { describe, expect, it } from "vitest";
import { assertResult } from "@/lib/validation";

describe("dynamic result contract", () => {
  it("accepts variable section and typed block counts", () => {
    const result = assertResult({
      title: "Study pack",
      sections: Array.from({ length: 12 }, (_, index) => ({
        title: `Section ${index + 1}`,
        blocks: [{ type: "summary", content: "Overview" }, { type: "list", content: ["a", "b"] }],
      })),
    });
    expect(result.sections).toHaveLength(12);
  });

  it("rejects missing sections and empty blocks", () => {
    expect(() => assertResult({ title: "Missing sections" })).toThrow();
    expect(() => assertResult({ sections: [{ title: "No content", blocks: [] }] })).toThrow();
  });
});

