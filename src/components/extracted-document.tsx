"use client";
import { useState } from "react";
import { SourcePreview } from "@/components/source-preview";

export function ExtractedDocument({
  id,
  name,
  text,
  previewUrl,
  sourceUrl,
  mimeType,
  metadata,
  headings,
  onChange,
}: {
  id?: string;
  name: string;
  text: string;
  previewUrl?: string | null;
  sourceUrl?: string | null;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  headings: string[];
  onChange: (text: string) => void;
}) {
  const [compare, setCompare] = useState(false);
  const [editing, setEditing] = useState(false);
  const warnings = Array.isArray(metadata?.ocrWarnings)
    ? metadata.ocrWarnings
    : [];
  return (
    <details id={id} className="extracted-document">
      <summary>
        <span aria-hidden="true">▤</span>
        <span>
          <strong>{name}</strong>
          <small>
            {text.length.toLocaleString("vi-VN")} ký tự ·{" "}
            {text
              .replace(/```[\s\S]*?```/g, " [Sơ đồ / mã] ")
              .replace(/\$\$[\s\S]*?\$\$/g, " [Công thức] ")
              .replace(/\s+/g, " ")
              .slice(0, 135)}
          </small>
        </span>
        <b>
          Xem nội dung <span aria-hidden="true">⌄</span>
        </b>
      </summary>
      <div className="extracted-editor">
        {metadata?.readingOrderPreserved === true && (
          <p className="extraction-hint">
            Nội dung được đọc theo thứ tự. Sơ đồ và công thức được đặt tại vị
            trí tương ứng; hãy đối chiếu với tài liệu gốc.
          </p>
        )}
        {Number(metadata?.skippedIllustrations) > 0 && (
          <p className="extraction-hint">
            Đã bỏ qua {String(metadata?.skippedIllustrations)} ảnh minh họa
            không chứa dữ liệu kỹ thuật.
          </p>
        )}
        {warnings.map((warning, index) => (
          <p className="validation-message validation-warning" key={index}>
            {String(warning)}
          </p>
        ))}
        <div className="source-mode-switch">
          {sourceUrl && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setCompare((v) => !v)}
            >
              {compare ? "Ẩn bản gốc" : "Đối chiếu bản gốc"}
            </button>
          )}
          <button
            type="button"
            className={`button ${editing ? "button-secondary" : "button-primary"}`}
            onClick={() => setEditing(false)}
          >
            Đọc nội dung
          </button>
          <button
            type="button"
            className={`button ${editing ? "button-primary" : "button-secondary"}`}
            onClick={() => setEditing(true)}
          >
            Chỉnh sửa văn bản / mã
          </button>
        </div>
        <div className={compare ? "source-comparison" : ""}>
          {compare && sourceUrl && (
            <aside className="source-original">
              {previewUrl ? (
                <img src={previewUrl} alt={`Ảnh gốc: ${name}`} />
              ) : mimeType === "application/pdf" ? (
                <iframe
                  loading="lazy"
                  title={`PDF gốc: ${name}`}
                  src={sourceUrl}
                />
              ) : (
                <p>Word cần mở bằng ứng dụng đọc tài liệu.</p>
              )}
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Mở tài liệu gốc ↗
              </a>
              <p>
                Không có số đo độ tin cậy theo từng vùng; hãy đối chiếu các cảnh
                báo trích xuất.
              </p>
            </aside>
          )}
          {editing ? (
            <>
              <textarea
                aria-label={`Nội dung trích xuất: ${name}`}
                value={text}
                onChange={(event) => onChange(event.target.value)}
                rows={18}
                maxLength={500000}
              />
              <small>
                Giữ mã Mermaid trong ```mermaid và LaTeX trong $$ để dựng lại.
                Lưu chỉnh sửa hoặc xác nhận để cập nhật cấu trúc.
              </small>
            </>
          ) : (
            <SourcePreview text={text} headings={headings} />
          )}
        </div>
      </div>
    </details>
  );
}
