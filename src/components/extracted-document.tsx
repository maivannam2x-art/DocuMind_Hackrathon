"use client";
import { useState } from "react";
import { SourcePreview } from "@/components/source-preview";

export function ExtractedDocument({ name, text, previewUrl, metadata, headings, onChange }: { name: string; text: string; previewUrl?: string | null; metadata?: Record<string, unknown>; headings: string[]; onChange: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const warnings = Array.isArray(metadata?.ocrWarnings) ? metadata.ocrWarnings : [];
  return <details className="extracted-document">
    <summary><span aria-hidden="true">▤</span><span><strong>{name}</strong><small>{text.length.toLocaleString("vi-VN")} ký tự · {text.slice(0, 135).replace(/\s+/g, " ")}</small></span><b>Xem nội dung <span aria-hidden="true">⌄</span></b></summary>
    <div className="extracted-editor">
      {previewUrl && <img className="source-image-preview" src={previewUrl} alt={`Ảnh gốc: ${name}`} />}
      {metadata?.readingOrderPreserved === true && <p className="extraction-hint">Nội dung được đọc theo thứ tự. Sơ đồ và công thức được đặt tại vị trí tương ứng; hãy đối chiếu với tài liệu gốc.</p>}
      {Number(metadata?.skippedIllustrations) > 0 && <p className="extraction-hint">Đã bỏ qua {String(metadata?.skippedIllustrations)} ảnh minh họa không chứa dữ liệu kỹ thuật.</p>}
      {warnings.map((warning, index) => <p className="validation-message validation-warning" key={index}>{String(warning)}</p>)}
      <div className="source-mode-switch"><button type="button" className={`button ${editing ? "button-secondary" : "button-primary"}`} onClick={() => setEditing(false)}>Đọc nội dung</button><button type="button" className={`button ${editing ? "button-primary" : "button-secondary"}`} onClick={() => setEditing(true)}>Chỉnh sửa văn bản / mã</button></div>
      {editing ? <><textarea aria-label={`Nội dung trích xuất: ${name}`} value={text} onChange={event => onChange(event.target.value)} rows={18} maxLength={500000} /><small>Giữ mã Mermaid trong ```mermaid và LaTeX trong $$ để dựng lại. Lưu chỉnh sửa hoặc xác nhận để cập nhật cấu trúc.</small></> : <SourcePreview text={text} headings={headings} />}
    </div>
  </details>;
}
