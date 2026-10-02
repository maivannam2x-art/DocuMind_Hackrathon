"use client";

import React, { useEffect, useId, useState } from "react";
import { renderMermaid } from "@/lib/mermaid-browser";
import { getSupabaseAccessToken } from "@/lib/supabase-browser";
import {
  isListBlock,
  listItemText,
  scalarText,
  tableValues,
  type ResultBlock,
} from "@/lib/result-content";

function StoredVisual({ source, assetType, analysisId, resultId, initialUrl, expand = false }: {
  source: string; assetType: "mermaid" | "latex" | "plantuml"; analysisId?: string; resultId?: string; initialUrl?: string; expand?: boolean;
}) {
  const id = `visual-${useId().replaceAll(":", "")}`;
  const [opened, setOpened] = useState(expand || assetType === "latex");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setUrl(initialUrl ?? ""); setError(""); }, [initialUrl, source]);
  useEffect(() => {
    if (!opened || url || error || !analysisId || !resultId) return;
    let active = true;
    setError("");
    let guest = false;
    try { guest = JSON.parse(sessionStorage.getItem("documind:guest-analysis-ids") ?? "[]").includes(analysisId); } catch { /* cookie authorization */ }
    void (async () => {
      const token = guest ? null : await getSupabaseAccessToken();
      const send = (svg?: string) => fetch(`/api/analyses/${analysisId}/assets`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ resultId, assetType, source: source.trim(), svg }),
      });
      let response = await send();
      if (response.status === 422 && assetType === "mermaid" && source.length <= 10000) response = await send(await renderMermaid(source, id));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Chưa tạo và lưu được ảnh. Hãy thử lại.");
      if (active) setUrl(payload.data.signedUrl);
    })().catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Chưa lưu được ảnh."); });
    return () => { active = false; };
  }, [opened, url, source, analysisId, resultId, assetType, id, attempt, error]);
  const label = assetType === "latex" ? "Công thức" : "Sơ đồ";
  return <details className="diagram-view" open={opened} onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>{label} · mở để xem ảnh</summary>
    {opened && <>
      {url && <div className="diagram-render"><img src={url} alt={assetType === "latex" ? "Công thức toán" : "Sơ đồ từ tài liệu"} style={{ maxWidth: "100%", height: "auto", maxHeight: assetType === "latex" ? 100 : 700, objectFit: "contain" }} onError={() => { setUrl(""); setError("Đường dẫn ảnh đã hết hạn. Bấm thử lại để lấy ảnh đã lưu."); }} /></div>}
      {!url && !error && <p>Hệ thống đang dựng ảnh và lưu Supabase Storage...</p>}
      {error && <p className="diagram-error">{error} <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Thử lại</button></p>}
      <details><summary>Xem mã {assetType === "latex" ? "LaTeX" : assetType === "plantuml" ? "PlantUML" : "Mermaid"}</summary><pre>{source}</pre></details>
    </>}
  </details>;
}

/** Inline **bold** and `code` as React nodes; the text is never injected as HTML. */
function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </>
  );
}

const BULLET = /^\s*(?:[-*•+]|\d{1,3}[.)])\s+/;

/** Readable prose: blank-line paragraphs, bullet runs as lists, single newlines kept. */
export function RichText({ text }: { text: string }) {
  const groups: Array<{ list: boolean; lines: string[] }> = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) {
      groups.push({ list: false, lines: [] });
      continue;
    }
    const list = BULLET.test(line);
    const last = groups.at(-1);
    if (last && last.list === list && (list || last.lines.length))
      last.lines.push(line);
    else groups.push({ list, lines: [line] });
  }
  return (
    <div className="block-content rich-text">
      {groups
        .filter((group) => group.lines.length)
        .map((group, index) =>
          group.list ? (
            <ul key={index} className="result-list">
              {group.lines.map((line, lineIndex) => (
                <li key={lineIndex}>
                  <InlineText text={line.replace(BULLET, "")} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={index}>
              {group.lines.map((line, lineIndex) => (
                <React.Fragment key={lineIndex}>
                  {lineIndex > 0 && <br />}
                  <InlineText text={line} />
                </React.Fragment>
              ))}
            </p>
          ),
        )}
    </div>
  );
}

function ListItem({ item }: { item: unknown }) {
  const text = listItemText(item);
  const split =
    item && typeof item === "object" && !Array.isArray(item)
      ? text.indexOf(": ")
      : -1;
  return split > 0 ? (
    <li>
      <strong>{text.slice(0, split)}</strong> —{" "}
      <InlineText text={text.slice(split + 2)} />
    </li>
  ) : (
    <li>
      <InlineText text={text} />
    </li>
  );
}

function StructuredData({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="structured-data">
      {Object.entries(value).map(([key, child]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>{scalarText(child)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TableView({ content }: { content: unknown }) {
  const table = tableValues(content);
  if (table)
    return (
      <div className="table-scroll">
        <table className="result-table">
          <thead>
            <tr>
              {table.headers.map((header, i) => (
                <th key={i}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const object =
    content && typeof content === "object" && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : null;
  const rows = Array.isArray(content)
    ? content
    : Array.isArray(object?.rows)
      ? object.rows
      : [];
  const explicitHeaders = Array.isArray(object?.headers)
    ? object.headers.map(String)
    : [];
  const headers = explicitHeaders.length
    ? explicitHeaders
    : Array.from(
        new Set(
          rows.flatMap((row) =>
            row && typeof row === "object" && !Array.isArray(row)
              ? Object.keys(row)
              : [],
          ),
        ),
      );
  if (!headers.length || !rows.length)
    return <p className="block-content">{scalarText(content)}</p>;
  return (
    <div className="table-scroll">
      <table className="result-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header.replaceAll("_", " ")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((header, colIndex) => (
                <td key={`${rowIndex}-${header}`}>
                  {Array.isArray(row)
                    ? scalarText(row[colIndex])
                    : scalarText((row as Record<string, unknown>)?.[header])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ResultBlockView({
  block,
  analysisId,
  resultId,
  expandDiagram = false,
}: {
  block: ResultBlock;
  analysisId?: string;
  resultId?: string;
  expandDiagram?: boolean;
}) {
  const type = block.type.toLowerCase().replaceAll("-", "_");
  const contentType =
    block.contentType ??
    (typeof block.metadata?.contentType === "string"
      ? (block.metadata.contentType as ResultBlock["contentType"])
      : undefined);
  const source =
    typeof block.content === "string"
      ? block.content
      : scalarText(block.content);
  const labels: Record<string, string> = {
    paragraph: "Nội dung",
    summary: "Tóm tắt",
    key_points: "Ý chính",
    list: "Danh sách",
    workflow: "Quy trình",
    diagram: "Sơ đồ",
    mermaid: "Sơ đồ",
    formula: "Công thức",
    table: "Bảng",
    code: "Mã nguồn",
    image: "Hình ảnh",
    conclusion: "Kết luận",
  };
  const label = labels[type] ?? type.replaceAll("_", " ");

  let body;
  if (isListBlock(block)) {
    body = (
      <ul className="result-list">
        {(Array.isArray(block.content) ? block.content : [block.content]).map(
          (item, index) => (
            <ListItem key={index} item={item} />
          ),
        )}
      </ul>
    );
  } else if (contentType === "json" || type === "json") {
    body = (
      <div className="json-view">
        <span className="format-badge">JSON · dữ liệu có cấu trúc</span>
        <pre>{JSON.stringify(block.content, null, 2)}</pre>
      </div>
    );
  } else if (
    contentType === "latex" ||
    ["formula", "math", "equation"].includes(type)
  ) {
    const math =
      typeof block.metadata?.latex === "string"
        ? String(block.metadata.latex)
        : source;
    body = <StoredVisual source={math} assetType="latex" analysisId={analysisId} resultId={resultId} initialUrl={typeof block.metadata?.assetUrl === "string" ? block.metadata.assetUrl : undefined} expand />;
  } else if (
    contentType === "mermaid" ||
    type === "mermaid" ||
    (type === "diagram" &&
      /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey|requirementDiagram)\b/.test(
        source.trim(),
      ))
  ) {
    body = (
      <StoredVisual assetType="mermaid" initialUrl={typeof block.metadata?.assetUrl === "string" ? block.metadata.assetUrl : undefined}
        source={source.replace(/^```(?:mermaid)?\s*|```$/g, "").trim()}
        analysisId={analysisId}
        resultId={resultId}
        expand={expandDiagram}
      />
    );
  } else if (contentType === "image" || type === "image") {
    const candidate =
      typeof block.metadata?.assetUrl === "string"
        ? block.metadata.assetUrl
        : "";
    const safeUrl =
      candidate.startsWith("/") || /^https:\/\//i.test(candidate)
        ? candidate
        : "";
    body = safeUrl ? (
      <figure className="result-image">
        <img
          src={safeUrl}
          alt={String(block.metadata?.alt ?? "Hình ảnh từ tài liệu")}
        />
        <figcaption>
          {String(
            block.metadata?.caption ?? "Hình ảnh từ nội dung đã phân tích",
          )}
        </figcaption>
      </figure>
    ) : (
      <p className="diagram-error">
        Ảnh chưa có liên kết lưu trữ an toàn. Nội dung mô tả vẫn được giữ trong
        dữ liệu kết quả.
      </p>
    );
  } else if (contentType === "plantuml" || type === "plantuml") {
    body = <StoredVisual source={source} assetType="plantuml" analysisId={analysisId} resultId={resultId} initialUrl={typeof block.metadata?.assetUrl === "string" ? block.metadata.assetUrl : undefined} expand={expandDiagram} />;
  } else if (contentType === "table" || type === "table") {
    body = <TableView content={block.content} />;
  } else if (
    type === "list" ||
    type === "key_points" ||
    Array.isArray(block.content)
  ) {
    body = (
      <ul className="result-list">
        {(Array.isArray(block.content) ? block.content : [block.content]).map(
          (item, index) => (
            <ListItem key={index} item={item} />
          ),
        )}
      </ul>
    );
  } else if (
    contentType === "code" ||
    ["code", "sql", "command"].includes(type)
  ) {
    body = (
      <pre className="code-view">
        <code>{source}</code>
      </pre>
    );
  } else if (
    block.content &&
    typeof block.content === "object" &&
    !Array.isArray(block.content)
  ) {
    body = (
      <div>
        <span className="format-badge">
          Dữ liệu có cấu trúc · chưa được đánh dấu JSON
        </span>
        <StructuredData value={block.content as Record<string, unknown>} />
      </div>
    );
  } else {
    body = <RichText text={source} />;
  }

  return (
    <div className={`content-block content-${contentType ?? type}`}>
      <span className="block-type">
        {!isListBlock(block) && (contentType === "json" || type === "json")
          ? "JSON"
          : label}
      </span>
      {body}
    </div>
  );
}
