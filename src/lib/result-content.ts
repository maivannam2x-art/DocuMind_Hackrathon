export type ResultBlock = {
  type: string;
  content: unknown;
  contentType?:
    | "text"
    | "list"
    | "json"
    | "latex"
    | "mermaid"
    | "plantuml"
    | "table"
    | "code"
    | "image";
  metadata?: Record<string, unknown>;
};

/** The semantic list type takes priority over its JSON transport representation. */
export function isListBlock(block: ResultBlock) {
  return (
    block.contentType === "list" ||
    ["list", "key_points"].includes(
      block.type.toLowerCase().replaceAll("-", "_"),
    )
  );
}

export function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  if (Array.isArray(value)) return value.map(scalarText).join(" · ");
  if (typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => `${key}: ${scalarText(child)}`)
      .join("\n");
  return String(value);
}

/** Text for one list entry; LLMs often return `{ title, detail }` objects instead of strings. */
export function listItemText(item: unknown): string {
  const record =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : null;
  if (record) {
    const pick = (...keys: string[]) =>
      keys
        .map((key) => record[key])
        .find(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        ?.trim();
    const head = pick("title", "term", "point", "name", "label", "heading");
    const body = pick(
      "detail",
      "description",
      "explanation",
      "content",
      "text",
      "value",
      "summary",
    );
    if (head && body) return `${head}: ${body}`;
    if (head ?? body) return (head ?? body)!;
  }
  return scalarText(item);
}

export function tableValues(
  content: unknown,
): { headers: string[]; rows: string[][] } | null {
  if (typeof content === "string") {
    const rows = content
      .split("\n")
      .filter((line) => line.trim().startsWith("|"))
      .map((line) =>
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
    if (rows.length < 2) return null;
    const headers = rows.shift()!;
    if (rows[0]?.every((cell) => /^:?-+:?$/.test(cell))) rows.shift();
    return { headers, rows };
  }
  const object =
    content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : null;
  const rows = Array.isArray(content)
    ? content
    : Array.isArray(object?.rows)
      ? object.rows
      : [];
  if (!rows.length) return null;
  const headers = Array.isArray(object?.headers)
    ? object.headers.map(String)
    : Array.isArray(rows[0])
      ? rows[0].map((_, i) => `Cột ${i + 1}`)
      : Array.from(
          new Set(
            rows.flatMap((row) =>
              row && typeof row === "object" ? Object.keys(row) : [],
            ),
          ),
        );
  if (!headers.length) return null;
  return {
    headers,
    rows: rows.map((row) =>
      headers.map((header, i) =>
        scalarText(
          Array.isArray(row)
            ? row[i]
            : (row as Record<string, unknown>)?.[header],
        ),
      ),
    ),
  };
}

export function blockToPlainText(block: ResultBlock): string {
  const type = block.type.toLowerCase();
  if (isListBlock(block))
    return (Array.isArray(block.content) ? block.content : [block.content])
      .map(listItemText)
      .join("\n");
  if (block.contentType === "image" || type === "image")
    return String(
      block.metadata?.alt ?? block.metadata?.caption ?? "Hình ảnh đính kèm",
    );
  if (block.contentType === "json" || type === "json")
    return `Dữ liệu JSON:\n${JSON.stringify(block.content, null, 2)}`;
  if (block.contentType === "table" || type === "table") {
    const table = tableValues(block.content);
    if (table)
      return [
        table.headers.join(" | "),
        ...table.rows.map((row) => row.join(" | ")),
      ].join("\n");
    const object =
      block.content &&
      typeof block.content === "object" &&
      !Array.isArray(block.content)
        ? (block.content as Record<string, unknown>)
        : null;
    const rows = Array.isArray(block.content)
      ? block.content
      : Array.isArray(object?.rows)
        ? object.rows
        : [];
    return rows.map((row) => scalarText(row)).join("\n");
  }
  if (
    Array.isArray(block.content) &&
    ["list", "key_points"].includes(type.replaceAll("-", "_"))
  )
    return block.content.map(listItemText).join("\n");
  return scalarText(block.content);
}
