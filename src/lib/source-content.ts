import { markdownCells } from "@/lib/tables";
import type { ResultBlock } from "@/lib/result-content";

export function sourceContentBlocks(
  text: string,
  headings: string[] = [],
): Array<ResultBlock & { heading?: boolean }> {
  const knownHeadings = new Set(headings);
  const blocks: Array<ResultBlock & { heading?: boolean }> = [];
  const lines = text.split("\n");
  let paragraph: string[] = [];
  const flush = () => {
    const content = paragraph.join("\n").trim();
    if (content) blocks.push({ type: "paragraph", content });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      trimmed = line.trim();
    const fence = /^(```|~~~)([a-zA-Z0-9_-]*)\s*$/.exec(trimmed);
    if (fence) {
      let end = i + 1;
      while (end < lines.length && lines[end].trim() !== fence[1]) end++;
      if (end === lines.length) {
        paragraph.push(line);
        continue;
      }
      flush();
      const content = lines.slice(i + 1, end).join("\n");
      const language = fence[2].toLowerCase();
      blocks.push({
        type: ["mermaid", "plantuml"].includes(language)
          ? "diagram"
          : ["latex", "tex"].includes(language)
            ? "formula"
            : "code",
        contentType:
          language === "mermaid"
            ? "mermaid"
            : language === "plantuml"
              ? "plantuml"
              : ["latex", "tex"].includes(language)
                ? "latex"
                : "code",
        content,
      });
      i = end;
      continue;
    }
    if (trimmed.startsWith("$$")) {
      let math = trimmed.slice(2),
        end = i;
      while (!math.includes("$$") && end + 1 < lines.length)
        math += `\n${lines[++end]}`;
      const closing = math.indexOf("$$");
      if (closing >= 0 && !math.slice(closing + 2).trim()) {
        flush();
        blocks.push({
          type: "formula",
          contentType: "latex",
          content: math.slice(0, closing).trim(),
        });
        i = end;
        continue;
      }
    }
    if (/^#{1,6}\s+/.test(trimmed) || knownHeadings.has(trimmed)) {
      flush();
      blocks.push({
        type: "heading",
        heading: true,
        content: trimmed.replace(/^#{1,6}\s+/, ""),
      });
      continue;
    }
    if (trimmed.startsWith("|")) {
      let end = i;
      while (end + 1 < lines.length && lines[end + 1].trim().startsWith("|"))
        end++;
      const rows = lines.slice(i, end + 1).map((row) => markdownCells(row));
      if (rows.length > 1) {
        flush();
        const headers = rows.shift()!;
        if (rows[0].every((cell) => /^:?-+:?$/.test(cell))) rows.shift();
        blocks.push({
          type: "table",
          contentType: "table",
          content: { headers, rows },
        });
        i = end;
        continue;
      }
    }
    if (/^(?:[-*•+]|\d{1,3}[.)])\s+\S/.test(trimmed) && !paragraph.length) {
      // A run of bullet/numbered lines reads better as a list than as one paragraph.
      let end = i;
      while (
        end + 1 < lines.length &&
        /^(?:[-*•+]|\d{1,3}[.)])\s+\S/.test(lines[end + 1].trim())
      )
        end++;
      if (end > i) {
        blocks.push({
          type: "list",
          content: lines
            .slice(i, end + 1)
            .map((item) =>
              item.trim().replace(/^(?:[-*•+]|\d{1,3}[.)])\s+/, ""),
            ),
        });
        i = end;
        continue;
      }
    }
    if (!trimmed) flush();
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

export function preserveSourceVisuals<
  T extends { sections: Array<{ title: string; blocks: ResultBlock[] }> },
>(result: T, source: string, title: string): T {
  const visuals = sourceContentBlocks(source).filter((block) =>
    ["latex", "mermaid", "plantuml", "table"].includes(block.contentType ?? ""),
  );
  const existing = new Set(
    result.sections
      .flatMap((section) => section.blocks)
      .map(
        (block) =>
          `${block.contentType}:${JSON.stringify(block.content).replace(/\s+/g, " ").trim()}`,
      ),
  );
  const missing = visuals.filter(
    (block) =>
      !existing.has(
        `${block.contentType}:${JSON.stringify(block.content).replace(/\s+/g, " ").trim()}`,
      ),
  );
  return missing.length
    ? {
        ...result,
        sections: [
          ...result.sections,
          {
            title: `${title} — Bảng, sơ đồ và công thức nguồn`,
            blocks: missing.map((block) => ({
              ...block,
              metadata: { sourceRetained: true },
            })),
          },
        ],
      }
    : result;
}
