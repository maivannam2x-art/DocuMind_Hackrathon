"use client";

import { useEffect, useId, useRef, useState } from "react";
import katex from "katex";
import { getSupabaseAccessToken } from "@/lib/supabase-browser";
import { scalarText, type ResultBlock } from "@/lib/result-content";

function MermaidDiagram({ source, analysisId, resultId }: { source: string; analysisId?: string; resultId?: string }) {
  const id = `mermaid-${useId().replaceAll(":", "")}`;
  const [opened, setOpened] = useState(false);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const persistedKey = useRef("");
  useEffect(() => {
    if (!opened || !source.trim() || source.length > 10000) return;
    let current = true;
    import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", suppressErrorRendering: true });
      const parsed = await mermaid.parse(source, { suppressErrors: true });
      if (!parsed) throw new Error("Invalid Mermaid source");
      // Mermaid otherwise inserts its giant error diagram into document.body
      // when a source parses but fails during drawing. Keep its work detached.
      return mermaid.render(id, source, document.createElement("div"));
    }).then(({ svg: rendered }) => {
      if (current) setSvg(rendered);
    }).catch(() => {
      if (current) setError("Không thể dựng sơ đồ tự động. Mã nguồn sơ đồ vẫn được giữ bên dưới.");
    });
    return () => { current = false; };
  }, [id, source, opened]);
  useEffect(() => {
    if (!svg || !analysisId || !resultId) return;
    const key = `${analysisId}:${resultId}:${source}`;
    if (persistedKey.current === key) return;
    let current = true;
    let isGuestAnalysis = false;
    try {
      const ids = JSON.parse(sessionStorage.getItem("documind:guest-analysis-ids") ?? "[]") as unknown;
      isGuestAnalysis = Array.isArray(ids) && ids.includes(analysisId);
    } catch { /* A guest cookie can still authorize the request. */ }
    void (isGuestAnalysis ? Promise.resolve(null) : getSupabaseAccessToken()).then(token => fetch(`/api/analyses/${analysisId}/assets`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ resultId, assetType: "mermaid", source, svg, title: "Sơ đồ trong kết quả phân tích" }),
    })).then(response => {
      if (response.ok && current) persistedKey.current = key;
    }).catch(() => undefined);
    return () => { current = false; };
  }, [analysisId, resultId, source, svg]);
  return <details className="diagram-view" onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>{svg ? "Sơ đồ · mở để xem ảnh" : "Sơ đồ · mở để kiểm tra và dựng ảnh"}</summary>
    {opened && <>{svg && <div className="diagram-render" role="img" aria-label="Sơ đồ từ tài liệu" dangerouslySetInnerHTML={{ __html: svg }} />}
      {(error || source.length > 10000) && <p className="diagram-error">Mã sơ đồ không hợp lệ hoặc quá dài để dựng ảnh. Nội dung nguồn vẫn được giữ bên dưới.</p>}
      {!svg && !error && source.length <= 10000 && <p className="diagram-error">Đang kiểm tra cú pháp sơ đồ...</p>}
      <details><summary>Xem mã Mermaid</summary><pre>{source}</pre></details></>}
  </details>;
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

export function ResultBlockView({ block, analysisId, resultId }: { block: ResultBlock; analysisId?: string; resultId?: string }) {
  const type = block.type.toLowerCase().replaceAll("-", "_");
  const contentType = block.contentType ?? (typeof block.metadata?.contentType === "string" ? block.metadata.contentType as ResultBlock["contentType"] : undefined);
  const source = typeof block.content === "string" ? block.content : scalarText(block.content);
  const labels: Record<string, string> = {
    paragraph: "Nội dung", summary: "Tóm tắt", key_points: "Ý chính", list: "Danh sách",
    workflow: "Quy trình", diagram: "Sơ đồ", mermaid: "Sơ đồ", formula: "Công thức",
    table: "Bảng", code: "Mã nguồn", image: "Hình ảnh", conclusion: "Kết luận",
  };
  const label = labels[type] ?? type.replaceAll("_", " ");

  let body;
  if (contentType === "json" || type === "json") {
    body = <div className="json-view"><span className="format-badge">JSON · dữ liệu có cấu trúc</span><pre>{JSON.stringify(block.content, null, 2)}</pre></div>;
  } else if (contentType === "latex" || ["formula", "math", "equation"].includes(type)) {
    const math = typeof block.metadata?.latex === "string" ? String(block.metadata.latex) : source;
    const rendered = katex.renderToString(math.replace(/^\$\$?|\$\$?$/g, ""), { displayMode: true, throwOnError: false, trust: false, strict: "ignore" });
    body = <div className="formula-view" aria-label="Công thức toán" dangerouslySetInnerHTML={{ __html: rendered }} />;
  } else if (contentType === "mermaid" || type === "mermaid" || (type === "diagram" && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey|requirementDiagram)\b/.test(source.trim()))) {
    body = <MermaidDiagram source={source.replace(/^```(?:mermaid)?\s*|```$/g, "").trim()} analysisId={analysisId} resultId={resultId} />;
  } else if (contentType === "image" || type === "image") {
    const candidate = typeof block.metadata?.assetUrl === "string" ? block.metadata.assetUrl : "";
    const safeUrl = candidate.startsWith("/") || /^https:\/\//i.test(candidate) ? candidate : "";
    body = safeUrl ? <figure className="result-image"><img src={safeUrl} alt={String(block.metadata?.alt ?? "Hình ảnh từ tài liệu")} /><figcaption>{String(block.metadata?.caption ?? "Hình ảnh từ nội dung đã phân tích")}</figcaption></figure> : <p className="diagram-error">Ảnh chưa có liên kết lưu trữ an toàn. Nội dung mô tả vẫn được giữ trong dữ liệu kết quả.</p>;
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
