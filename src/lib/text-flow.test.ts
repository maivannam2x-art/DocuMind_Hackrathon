import { describe, expect, it } from "vitest";
import { joinPdfHyphenation, normalizeText } from "@/lib/documents";
import { sourceContentBlocks } from "@/lib/source-content";
import { blockToPlainText, listItemText } from "@/lib/result-content";
import { reportToMarkdown } from "@/lib/report";

describe("input text normalization", () => {
  it("keeps code indentation while collapsing inner spaces", () => {
    expect(normalizeText("def f():\n\tif x:   return  1\n        pass   ")).toBe("def f():\n    if x: return 1\n        pass");
  });

  it("composes decomposed Vietnamese and drops invisible characters", () => {
    const decomposed = "Cơ sở dữ liệu".normalize("NFD");
    expect(normalizeText(`﻿${decomposed}​ mới`)).toBe("Cơ sở dữ liệu mới");
  });

  it("joins words hyphenated across PDF lines but keeps list dashes", () => {
    expect(joinPdfHyphenation("infor-\nmation\n- item")).toBe("information\n- item");
  });
});

describe("source preview and output text", () => {
  it("turns bullet runs into list blocks", () => {
    const blocks = sourceContentBlocks("Mở đầu.\n\n- Một\n- Hai\n1. Ba");
    expect(blocks).toEqual([{ type: "paragraph", content: "Mở đầu." }, { type: "list", content: ["Một", "Hai", "Ba"] }]);
  });

  it("renders object list items as readable text in exports", () => {
    expect(listItemText({ title: "JWT", detail: "Token ký số" })).toBe("JWT: Token ký số");
    expect(blockToPlainText({ type: "key_points", content: [{ title: "A", detail: "B" }, "C"] })).toBe("A: B\nC");
    const markdown = reportToMarkdown({ title: "T", sections: [{ title: "S", blocks: [{ type: "key_points", content: [{ point: "Gateway", description: "xác thực" }] }] }] });
    expect(markdown).toContain("- Gateway: xác thực");
    expect(markdown).not.toContain("[object Object]");
  });
});
