import { describe, expect, it } from "vitest";
import { chunkText, extractFile, normalizeText } from "@/lib/documents";

describe("document preparation", () => {
  it("normalizes line endings, control characters, and repeated whitespace", () => {
    expect(normalizeText(" A\r\nB\u0001  C\n\n\nD ")).toBe("A\nB C\n\nD");
  });

  it("extracts Markdown and source-code files as normalized UTF-8 text", async () => {
    const markdown = new File(["# API Design\r\n\r\nRoutes and schemas"], "api-design.md", { type: "text/markdown" });
    const source = new File(["export const answer = 42;"], "answer.ts", { type: "text/typescript" });

    await expect(extractFile(markdown)).resolves.toMatchObject({
      name: "api-design.md",
      mimeType: "text/markdown",
      text: "# API Design\n\nRoutes and schemas",
    });
    await expect(extractFile(source)).resolves.toMatchObject({
      name: "answer.ts",
      mimeType: "text/typescript",
      text: "export const answer = 42;",
    });
  });

  it("keeps headings as chunk titles and covers all content", () => {
    const chunks = chunkText("# Part one\nA useful paragraph.\n\n## Part two\nAnother useful paragraph.");
    expect(chunks.map(chunk => chunk.title)).toEqual(["Part one", "Part two"]);
    expect(chunks.map(chunk => chunk.content).join("\n")).toContain("Another useful paragraph.");
  });

  it("splits long text into bounded overlapping chunks", () => {
    const previous = { limit: process.env.MAX_CHUNK_CHARS, overlap: process.env.CHUNK_OVERLAP_CHARS };
    process.env.MAX_CHUNK_CHARS = "200";
    process.env.CHUNK_OVERLAP_CHARS = "20";
    const source = "This is a sentence with enough content. ".repeat(30);
    const chunks = chunkText(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.content.length <= 200)).toBe(true);
    if (previous.limit === undefined) delete process.env.MAX_CHUNK_CHARS; else process.env.MAX_CHUNK_CHARS = previous.limit;
    if (previous.overlap === undefined) delete process.env.CHUNK_OVERLAP_CHARS; else process.env.CHUNK_OVERLAP_CHARS = previous.overlap;
  });
});
