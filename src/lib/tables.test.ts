import type { ResultBlock } from "./result-content";
import { it, expect } from "vitest";
import { parseDelimitedTable, markdownTable } from "./tables";
import { sourceContentBlocks, preserveSourceVisuals } from "./source-content";
it("retains CSV strings, quoted commas, newlines, quotes and pipes", () => {
  const data = parseDelimitedTable(
    'ID,Note\r\n001,"a,b | c"\r\n002,"line1\nline2 ""q"""',
  );
  expect(data.rows).toEqual([
    ["001", "a,b | c"],
    ["002", 'line1\nline2 "q"'],
  ]);
  const blocks = sourceContentBlocks(markdownTable(data.headers, data.rows));
  expect(blocks[0].content).toMatchObject({
    headers: ["ID", "Note"],
    rows: [
      ["001", "a,b | c"],
      ["002", 'line1 ⏎ line2 "q"'],
    ],
  });
});
it("rejects malformed CSV instead of fabricating missing cells", () => {
  expect(() => parseDelimitedTable("a,b\n1")).toThrow();
  expect(() => parseDelimitedTable('a,b\n1,"2')).toThrow();
});
it("restores an omitted source table without losing rows", () => {
  const result = preserveSourceVisuals(
    { sections: [{ title: "SQL", blocks: [] as ResultBlock[] }] },
    "| ID | Value |\n| --- | --- |\n| 001 | 0.00 |",
    "I. SQL",
  );
  expect(result.sections[1].blocks[0].content).toMatchObject({
    rows: [["001", "0.00"]],
  });
});
it("extracts a Word table natively with all source values", async () => {
  const { Document, Packer, Table, TableRow, TableCell, Paragraph } =
    await import("docx");
  const { extractFile } = await import("./documents");
  const bytes = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Table({
              rows: [
                ["ID", "Value"],
                ["001", "0.00"],
              ].map(
                (row) =>
                  new TableRow({
                    children: row.map(
                      (text) =>
                        new TableCell({ children: [new Paragraph(text)] }),
                    ),
                  }),
              ),
            }),
          ],
        },
      ],
    }),
  );
  const value = await extractFile(
    new File([Uint8Array.from(bytes)], "table.docx"),
  );
  const table = sourceContentBlocks(value.text).find(
    (b) => b.contentType === "table",
  );
  expect(table?.content).toMatchObject({
    rows: [
      ["ID", "Value"],
      ["001", "0.00"],
    ],
  });
});
it("splits large tables at row boundaries and repeats column headers", async () => {
  const { chunkText } = await import("./documents");
  const table = markdownTable(
    ["ID", "Value"],
    Array.from({ length: 1600 }, (_, i) => [String(i), `value_${i}`]),
  );
  const chunks = chunkText("I. Dữ liệu\n" + table);
  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    const parsed = sourceContentBlocks(chunk.content).find(
      (b) => b.contentType === "table",
    );
    expect(parsed?.content).toMatchObject({ headers: ["ID", "Value"] });
  }
  const rows = chunks.flatMap((chunk) => {
    const block = sourceContentBlocks(chunk.content).find(
      (b) => b.contentType === "table",
    );
    return (block?.content as { rows: string[][] }).rows;
  });
  expect(rows).toHaveLength(1600);
  expect(new Set(rows.map((r) => r[0])).size).toBe(1600);
});
