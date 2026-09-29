import { afterEach, describe, expect, it } from "vitest";
import { generateLlm, geminiSchema } from "@/lib/llm";
import { assertResult } from "@/lib/validation";

describe("LLM provider adapter", () => {
  afterEach(() => { delete process.env.LLM_PROVIDER; });

  it("drops required fields that are not present in the converted Gemini properties", () => {
    expect(geminiSchema({
      type: "object",
      properties: { kept: { type: "string" } },
      required: ["kept", "missing"],
    })).toEqual({
      type: "OBJECT",
      properties: { kept: { type: "STRING" } },
      required: ["kept"],
    });
  });

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
    expect(response.value).toMatchObject({ isIT: true, specializationSlug: "databases" });
  });

  it("routes an unrelated or unclear subject to the general prompt scope", async () => {
    process.env.LLM_PROVIDER = "mock";
    const response = await generateLlm({
      purpose: "topic_detection", system: "test",
      prompt: "Nội dung: Tác phẩm văn học kể về hành trình trưởng thành của nhân vật chính.",
    });
    expect(response.value).toMatchObject({ isIT: false, specializationSlug: null });
  });

  it("retains a long IT chunk and exposes formulas and algorithms as typed blocks in demo mode", async () => {
    process.env.LLM_PROVIDER = "mock";
    const source = `# TCP handshake\n${"Một đoạn mô tả kỹ thuật về kết nối TCP và trạng thái socket.\n".repeat(90)}\n$$RTT=t_2-t_1$$\n\`\`\`mermaid\nsequenceDiagram\nClient->>Server: SYN\nServer-->>Client: SYN-ACK\n\`\`\``;
    const response = await generateLlm({ purpose: "section_generation", system: "test", prompt: `Nội dung: ${source}` });
    const result = assertResult(response.value);
    expect(JSON.stringify(result)).toContain("trạng thái socket");
    expect(JSON.stringify(result)).toContain("SYN-ACK");
    expect(result.sections.flatMap(section => section.blocks)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "formula", contentType: "latex", content: "RTT=t_2-t_1" }),
      expect.objectContaining({ type: "diagram", contentType: "mermaid", content: expect.stringContaining("sequenceDiagram") }),
    ]));
  });
});
