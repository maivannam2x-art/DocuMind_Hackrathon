export class TableParseError extends Error { constructor(public code:string,message:string){super(message);} }
/** RFC-style quoted cells, embedded newlines and escaped quotes; retain values as strings. */
export function parseDelimitedTable(text: string) {
  const first = text.split(/\r?\n/, 1)[0];
  const candidates = [",", ";", "\t"]
    .map((d) => ({ d, n: first.split(d).length }))
    .sort((a, b) => b.n - a.n);
  const delimiter = candidates[0].d;
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else cell += c;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.length)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted)
    throw new TableParseError(
      "INVALID_CSV",
      "Bảng CSV có dấu ngoặc kép chưa đóng. Hãy kiểm tra tệp.",
    );
  row.push(cell);
  if (row.some((v) => v.length)) rows.push(row);
  if (!rows.length)
    throw new TableParseError( "EMPTY_TABLE", "Bảng không có dữ liệu.");
  const width = Math.max(...rows.map((r) => r.length));
  if (rows.some((r) => r.length !== width))
    throw new TableParseError(
      "IRREGULAR_CSV",
      "Số cột giữa các hàng CSV không đồng nhất. Hãy kiểm tra dấu phân cách.",
    );
  return { headers: rows[0], rows: rows.slice(1) };
}
export function markdownTable(headers: string[], rows: string[][]) {
  const safe = (s: string) =>
    s.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replace(/\r?\n/g, " ⏎ ");
  return [headers, headers.map(() => "---"), ...rows]
    .map((r) => `| ${r.map(safe).join(" | ")} |`)
    .join("\n");
}
export function markdownCells(line: string) {
  const cells: string[] = [];
  let current = "",
    escaped = false;
  for (const c of line.trim().replace(/^\||\|$/g, "")) {
    if (escaped) {
      current += c;
      escaped = false;
    } else if (c === "\\") escaped = true;
    else if (c === "|") {
      cells.push(current.trim());
      current = "";
    } else current += c;
  }
  cells.push(current.trim());
  return cells;
}
