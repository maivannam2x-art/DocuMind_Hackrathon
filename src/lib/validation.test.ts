import { describe, expect, it } from "vitest";
import { assertResult, resultSchema } from "@/lib/validation";

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

  it("requires an explicit contentType for structured object data", () => {
    const unmarked = { sections: [{ title: "API", blocks: [{ type: "data", content: { method: "POST", path: "/api/items" } }] }] };
    const unmarkedResult = resultSchema.safeParse(unmarked);
    expect(unmarkedResult.success).toBe(false);
    if (!unmarkedResult.success) expect(unmarkedResult.error.issues.some(issue => issue.path.includes("contentType"))).toBe(true);
    expect(assertResult({ sections: [{ title: "API", blocks: [{ type: "json", contentType: "json", content: { method: "POST", path: "/api/items" } }] }] }).sections[0].blocks[0].contentType).toBe("json");
  });
});
