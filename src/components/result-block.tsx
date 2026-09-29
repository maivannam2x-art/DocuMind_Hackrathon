"use client";

import { useEffect, useId, useState } from "react";
import katex from "katex";
import { scalarText, type ResultBlock } from "@/lib/result-content";

function MermaidDiagram({ source }: { source: string }) {
  const id = `mermaid-${useId().replaceAll(":", "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
      return mermaid.render(id, source);
    }).then(({ svg: rendered }) => {
      if (current) setSvg(rendered);
    }).catch(() => {
      if (current) setError("Không thể dựng sơ đồ tự động. Mã nguồn sơ đồ vẫn được giữ bên dưới.");
    });
    return () => { current = false; };
  }, [id, source]);
  return <div className="diagram-view">
    {svg && <div className="diagram-render" role="img" aria-label="Sơ đồ từ tài liệu" dangerouslySetInnerHTML={{ __html: svg }} />}
    {error && <p className="diagram-error">{error}</p>}
    <details><summary>{svg ? "Xem mã sơ đồ" : "Mã sơ đồ"}</summary><pre>{source}</pre></details>
  </div>;
}

function StructuredData({ value }: { value: Record<string, unknown> }) {
  return <dl className="structured-data">{Object.entries(value).map(([key, child]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{scalarText(child)}</dd></div>)}</dl>;
}

function TableView({ content }: { content: unknown }) {
  const object = content && typeof content === "object" && !Array.isArray(content) ? content as Record<string, unknown> : null;
  const rows = Array.isArray(content) ? content : Array.isArray(object?.rows) ? object.rows : [];
  const explicitHeaders = Array.isArray(object?.headers) ? object.headers.map(String) : [];
  const headers = explicitHeaders.length ? explicitHeaders : Array.from(new Set(rows.flatMap(row => row && typeof row === "object" && !Array.isArray(row) ? Object.keys(row) : [])));
  if (!headers.length || !rows.length) return <p className="block-content">{scalarText(content)}</p>;
  return <div className="table-scroll"><table className="result-table"><thead><tr>{headers.map(header => <th key={header}>{header.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((header, colIndex) => <td key={`${rowIndex}-${header}`}>{Array.isArray(row) ? scalarText(row[colIndex]) : scalarText((row as Record<string, unknown>)?.[header])}</td>)}</tr>)}</tbody></table></div>;
}

export function ResultBlockView({ block }: { block: ResultBlock }) {
  const type = block.type.toLowerCase().replaceAll("-", "_");
  const contentType = block.contentType ?? (typeof block.metadata?.contentType === "string" ? block.metadata.contentType as ResultBlock["contentType"] : undefined);
  const source = typeof block.content === "string" ? block.content : scalarText(block.content);
  const label = type.replaceAll("_", " ");

  let body;
  if (contentType === "json" || type === "json") {
    body = <div className="json-view"><span className="format-badge">JSON · dữ liệu có cấu trúc</span><pre>{JSON.stringify(block.content, null, 2)}</pre></div>;
  } else if (contentType === "latex" || ["formula", "math", "equation"].includes(type)) {
    const math = typeof block.metadata?.latex === "string" ? String(block.metadata.latex) : source;
    const rendered = katex.renderToString(math.replace(/^\$\$?|\$\$?$/g, ""), { displayMode: true, throwOnError: false, trust: false, strict: "ignore" });
    body = <div className="formula-view" aria-label="Công thức toán" dangerouslySetInnerHTML={{ __html: rendered }} />;
  } else if (contentType === "mermaid" || type === "mermaid" || (type === "diagram" && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey|requirementDiagram)\b/.test(source.trim()))) {
    body = <MermaidDiagram source={source} />;
  } else if (contentType === "plantuml" || type === "plantuml") {
    body = <div className="diagram-view"><span className="format-badge">PlantUML · mã sơ đồ</span><pre>{source}</pre><p className="diagram-error">Mã PlantUML được giữ nguyên để xuất hoặc mở bằng công cụ PlantUML.</p></div>;
  } else if (contentType === "table" || type === "table") {
    body = <TableView content={block.content} />;
  } else if (type === "list" || type === "key_points" || Array.isArray(block.content)) {
    body = <ul className="result-list">{(Array.isArray(block.content) ? block.content : [block.content]).map((item, index) => <li key={index}>{scalarText(item)}</li>)}</ul>;
  } else if (contentType === "code" || ["code", "sql", "command"].includes(type)) {
    body = <pre className="code-view"><code>{source}</code></pre>;
  } else if (block.content && typeof block.content === "object" && !Array.isArray(block.content)) {
    body = <div><span className="format-badge">Dữ liệu có cấu trúc · chưa được đánh dấu JSON</span><StructuredData value={block.content as Record<string, unknown>} /></div>;
  } else {
    body = <div className="block-content">{source}</div>;
  }

  return <div className={`content-block content-${contentType ?? type}`}>
    <span className="block-type">{contentType === "json" || type === "json" ? "JSON" : label}</span>
    {body}
  </div>;
}
