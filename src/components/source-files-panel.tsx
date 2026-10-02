"use client";
import { useState } from "react";
import type { WorkspaceContext } from "@/hooks/use-workspace";
export function SourceFilesPanel({ workspace }: { workspace: WorkspaceContext }) {
  const { analysisId, inputRows, api } = workspace;
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [readyUrl, setReadyUrl] = useState("");
  if (!analysisId || !inputRows.length) return null;
  const openOriginal = async (inputId: string) => {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setOpening(inputId); setError(""); setReadyUrl("");
    try {
      const { url } = await api<{ url: string }>(`/api/analyses/${analysisId}/inputs/${inputId}/source`);
      if (tab && !tab.closed) tab.location.href = url;
      else setReadyUrl(url);
    } catch (failure) {
      tab?.close();
      setError(failure instanceof Error ? failure.message : "Chưa mở được tệp gốc.");
    } finally { setOpening(null); }
  };
  return <section className="panel source-files-panel" aria-label="Tài liệu đầu vào">
    <h3>Tài liệu đầu vào của phiên</h3>
    <p>Tệp gốc được lưu riêng tư. Mở lại để đối chiếu với kết quả hoặc kiểm tra phiên trong lịch sử.</p>
    <ul>{inputRows.map(input => <li key={input.id}>
      <div><strong>{input.original_name || "Nội dung đã dán"}</strong>
        <small>{input.byte_size ? `${(input.byte_size / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KB · ` : ""}{input.input_kind === "pasted_text" ? "Văn bản đã dán" : "Tệp tải lên"}</small></div>
      <button type="button" className="button button-secondary" disabled={opening !== null} onClick={() => void openOriginal(input.id)}>{opening === input.id ? "Đang mở…" : "Mở bản gốc ↗"}</button>
    </li>)}</ul>
    {error && <p role="alert" className="diagram-error">{error}</p>}
    {readyUrl && <a href={readyUrl} target="_blank" rel="noopener noreferrer">Bấm để mở tệp gốc ↗</a>}
  </section>;
}
