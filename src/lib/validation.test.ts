import { describe, expect, it } from "vitest";
import {
  assertHasAnalysisInput,
  assertResult,
  createAnalysisSchema,
  normalizeResult,
  resultSchema,
} from "@/lib/validation";

describe("dynamic result contract", () => {
  it("accepts variable section and typed block counts", () => {
    const result = assertResult({
      title: "Study pack",
      conclusion: "Dựa trên nguồn đã gửi.",
      sections: Array.from({ length: 12 }, (_, index) => ({
        title: `Section ${index + 1}`,
        blocks: [
          { type: "summary", content: "Overview" },
          { type: "list", content: ["a", "b"] },
        ],
      })),
    });
    expect(result.sections).toHaveLength(12);
    expect(result.conclusion).toBe("Dựa trên nguồn đã gửi.");
  });

  it("rejects missing sections and empty blocks", () => {
    expect(() => assertResult({ title: "Missing sections" })).toThrow();
    expect(() =>
      assertResult({ sections: [{ title: "No content", blocks: [] }] }),
    ).toThrow();
  });

  it("requires an explicit contentType for structured object data", () => {
    const unmarked = {
      sections: [
        {
          title: "API",
          blocks: [
            { type: "data", content: { method: "POST", path: "/api/items" } },
          ],
        },
      ],
    };
    const unmarkedResult = resultSchema.safeParse(unmarked);
    expect(unmarkedResult.success).toBe(false);
    if (!unmarkedResult.success)
      expect(
        unmarkedResult.error.issues.some((issue) =>
          issue.path.includes("contentType"),
        ),
      ).toBe(true);
    expect(
      assertResult({
        sections: [
          {
            title: "API",
            blocks: [
              {
                type: "json",
                contentType: "json",
                content: { method: "POST", path: "/api/items" },
              },
            ],
          },
        ],
      }).sections[0].blocks[0].contentType,
    ).toBe("json");
  });

  it("converts fenced Mermaid into a typed diagram block", () => {
    const result = assertResult({
      sections: [
        {
          title: "Request",
          blocks: [
            {
              type: "paragraph",
              content:
                "```mermaid\nsequenceDiagram\n  Client->>API: GET /health\n```",
            },
          ],
        },
      ],
    });
    expect(result.sections[0].blocks[0]).toMatchObject({
      type: "diagram",
      contentType: "mermaid",
      content: "sequenceDiagram\n  Client->>API: GET /health",
    });
  });

  it("converts standalone LaTeX markers into a formula block", () => {
    const result = assertResult({
      sections: [
        {
          title: "Latency",
          blocks: [
            {
              type: "paragraph",
              content: "$$T_{total}=T_{queue}+T_{service}$$",
            },
          ],
        },
      ],
    });
    expect(result.sections[0].blocks[0]).toMatchObject({
      type: "formula",
      contentType: "latex",
      content: "T_{total}=T_{queue}+T_{service}",
    });
  });

  it("marks JSON-looking string content and parses valid objects", () => {
    const result = normalizeResult({
      sections: [
        {
          title: "API",
          blocks: [
            {
              type: "paragraph",
              content: '{"method":"POST","path":"/api/items"}',
            },
          ],
        },
      ],
    }) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> };
    expect(result.sections[0].blocks[0]).toMatchObject({
      type: "json",
      contentType: "json",
      content: { method: "POST", path: "/api/items" },
    });
    expect(() =>
      assertResult({
        sections: [
          {
            title: "API",
            blocks: [{ type: "paragraph", content: { method: "POST" } }],
          },
        ],
      }),
    ).toThrow();
  });
});

describe("analysis input validation", () => {
  it("allows pasted text, multipart files, or staged direct uploads", () => {
    expect(() => assertHasAnalysisInput(" some notes ", 0, 0)).not.toThrow();
    expect(() => assertHasAnalysisInput(undefined, 1, 0)).not.toThrow();
    expect(() => assertHasAnalysisInput(undefined, 0, 1)).not.toThrow();
  });

  it("rejects empty submissions and file metadata outside the supported limits", () => {
    expect(() => assertHasAnalysisInput("   ", 0, 0)).toThrow(
      /ít nhất một tệp/,
    );
    const validFiles = Array.from({ length: 10 }, (_, index) => ({
      name: `doc-${index}.pdf`,
      byteSize: 20 * 1024 * 1024,
    }));
    expect(createAnalysisSchema.safeParse({ files: validFiles }).success).toBe(
      true,
    );
    expect(
      createAnalysisSchema.safeParse({
        files: [...validFiles, { name: "extra.pdf", byteSize: 10 }],
      }).success,
    ).toBe(false);
    expect(
      createAnalysisSchema.safeParse({
        files: [{ name: "empty.pdf", byteSize: 0 }],
      }).success,
    ).toBe(false);
    expect(
      createAnalysisSchema.safeParse({
        files: [{ name: "large.pdf", byteSize: 20 * 1024 * 1024 + 1 }],
      }).success,
    ).toBe(false);
  });
});

it("normalizes list transport separately from explicit technical JSON", () => {
  const value = assertResult({
    sections: [
      {
        title: "IT",
        blocks: [
          { type: "list", contentType: "json", content: ["API", "SQL"] },
          { type: "key_points", contentType: "json", content: '["TCP","UDP"]' },
          { type: "json", contentType: "json", content: { status: 200 } },
        ],
      },
    ],
  });
  expect(value.sections[0].blocks.map((b) => b.contentType)).toEqual([
    "list",
    "list",
    "json",
  ]);
});
