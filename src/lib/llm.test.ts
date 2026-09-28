import { afterEach, describe, expect, it } from "vitest";
import { generateLlm } from "@/lib/llm";
import { assertResult } from "@/lib/validation";

describe("LLM provider adapter", () => {
  afterEach(() => { delete process.env.LLM_PROVIDER; });

  it("returns schema-compatible sections in mock mode", async () => {
    process.env.LLM_PROVIDER = "mock";
    const response = await generateLlm({
      purpose: "section_generation",
      system: "test",
      prompt: "Tạo nội dung. Nội dung: # Dữ liệu\nDữ liệu là các giá trị được ghi nhận.",
    });
    const result = assertResult(response.value);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.sections.every(section => section.blocks.length > 0)).toBe(true);
    expect(response.provider).toBe("mock");
  });

  it("classifies IT documents into a focused specialization without an external API key", async () => {
    process.env.LLM_PROVIDER = "mock";
    const response = await generateLlm({
      purpose: "topic_detection", system: "test",
      prompt: "Nội dung: PostgreSQL database và SQL query",
    });
    expect(response.value).toMatchObject({ specializationSlug: "databases" });
  });
});
