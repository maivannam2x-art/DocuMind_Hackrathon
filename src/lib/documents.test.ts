import { describe, expect, it } from "vitest";
import { chunkText, normalizeText } from "@/lib/documents";

describe("document preparation", () => {
  it("normalizes line endings, control characters, and repeated whitespace", () => {
    expect(normalizeText(" A\r\nB\u0001  C\n\n\nD ")).toBe("A\nB C\n\nD");
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

