export type ResultBlock = {
  type: string;
  content: unknown;
  contentType?: "text" | "json" | "latex" | "mermaid" | "plantuml" | "table" | "code";
  metadata?: Record<string, unknown>;
};

export function scalarText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(scalarText).join(" · ");
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, child]) => `${key}: ${scalarText(child)}`).join("\n");
  return String(value);
}

export function blockToPlainText(block: ResultBlock): string {
  const type = block.type.toLowerCase();
  if (block.contentType === "json" || type === "json") return `Dữ liệu JSON:\n${JSON.stringify(block.content, null, 2)}`;
  if (block.contentType === "table" || type === "table") {
    const object = block.content && typeof block.content === "object" && !Array.isArray(block.content) ? block.content as Record<string, unknown> : null;
    const rows = Array.isArray(block.content) ? block.content : Array.isArray(object?.rows) ? object.rows : [];
    return rows.map(row => scalarText(row)).join("\n");
  }
  return scalarText(block.content);
}
