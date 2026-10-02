"use client";
import type { WorkspaceContext, OutlineItem } from "@/hooks/use-workspace";
import { locateIssue, type ValidationIssue } from "@/lib/validation-location";
import { ExtractedDocument } from "@/components/extracted-document";

export function ReviewScreen({ workspace }: { workspace: WorkspaceContext }) {
  const {
    setScreen,
    analysisId,
    analysis,
    files,
    title,
    topicMode,
    quizEnabled,
    setReviewDirty,
    reviewDirty,
    depth,
    inputRows,
    inputTexts,
    setInputTexts,
    report,
    busy,
    setError,
    allOutline,
    saveReview,
    confirmAndRun,
    OutlineTree,
    Icon,
  } = workspace;

  const issueContent = (item: ValidationIssue) => {
    const issue = locateIssue(item, inputRows.find(input => input.id === item.inputId)?.original_name);
    return <span><strong className="validation-location">{issue.location}</strong>{issue.message}
      {issue.inputId && <button type="button" className="text-button" onClick={() => {
        const document = window.document.getElementById(`input-${issue.inputId}`);
        if (document instanceof HTMLDetailsElement) document.open = true;
        document?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}>Xem vị trí trong tài liệu ↓</button>}
    </span>;
  };

  return (
    <div className="review-layout">
      <section className="panel review-main">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">BƯỚC 02 · KIỂM TRA ĐẦU VÀO</div>
            <h2>{analysis?.title || title || "Tài liệu mới"}</h2>
            <p>Rà soát nội dung trích xuất và cấu trúc trước khi gửi AI.</p>
          </div>
          <span
            className={`status-pill ${report?.valid ? "status-ok" : "status-warn"}`}
          >
            {report?.valid ? "Đã kiểm tra" : "Cần chỉnh sửa"}
          </span>
        </div>
        <div className="review-stats">
          <div>
            <strong>{report?.inputCount ?? inputRows.length}</strong>
            <span>Tệp đầu vào</span>
          </div>
          <div>
            <strong>{(report?.totalWords ?? 0).toLocaleString("vi-VN")}</strong>
            <span>Từ</span>
          </div>
          <div>
            <strong>{report?.chunkCount ?? allOutline.length}</strong>
            <span>Phần xử lý</span>
          </div>
        </div>
        {(report?.blockingErrors ?? []).map((item, i) => (
          <div className="validation-message validation-error" key={`e-${i}`}>
            <b>!</b>
            {issueContent(item)}
          </div>
        ))}
        {(report?.warnings ?? []).map((item, i) => (
          <div className="validation-message validation-warning" key={`w-${i}`}>
            <b>i</b>
            {issueContent(item)}
          </div>
        ))}
        {(report?.notes ?? []).map((item, i) => (
          <div className="validation-message validation-note" key={`n-${i}`}>
            <b>✓</b>
            {issueContent(item)}
          </div>
        ))}
        <div className="review-section-title">
          <div>
            <h3>Nội dung đã trích xuất</h3>
            <p>Chỉnh sửa nếu nội dung thiếu hoặc chưa chính xác.</p>
          </div>
          <span className="editable-label">Có thể chỉnh sửa</span>
        </div>
        {inputRows.map((input) => (
          <ExtractedDocument
            key={input.id}
            id={`input-${input.id}`}
            name={input.original_name || "Tài liệu"}
            text={inputTexts[input.id] ?? ""}
            sourceUrl={input.sourceUrl}
            mimeType={input.mime_type}
            previewUrl={input.previewUrl}
            metadata={input.metadata}
            headings={(() => {
              const titles = (nodes: OutlineItem[]): string[] =>
                nodes.flatMap((node) => [
                  node.title,
                  ...titles(node.children ?? []),
                ]);
              return titles(
                report?.inputs?.find((row) => row.id === input.id)?.structure ??
                  [],
              );
            })()}
            onChange={(value) => {
              setReviewDirty(true);
              setInputTexts((current) => ({ ...current, [input.id]: value }));
            }}
          />
        ))}
        <div className="review-section-title outline-heading">
          <div>
            <h3>Cấu trúc được đề xuất</h3>
            <p>
              Mở từng mục để xem mục con. Các mục ngắn được gom chung khi gửi
              AI; {report?.chunkCount ?? 0} phần xử lý không phải số lần chia đề
              mục.
            </p>
          </div>
        </div>
        <div className="outline-list">
          {report?.inputs?.map((input) => (
            <div className="outline-document" key={input.id}>
              <h4>{input.name || "Tài liệu"}</h4>
              <OutlineTree items={input.structure ?? []} />
            </div>
          ))}
          {!report && <OutlineTree items={allOutline} />}
          {allOutline.length === 0 && (
            <div className="empty-inline">
              Lưu nội dung chỉnh sửa để cập nhật cấu trúc tài liệu.
            </div>
          )}
        </div>
        <div className="review-actions">
          <button
            className="button button-quiet"
            disabled={busy}
            onClick={() => {
              setScreen("input");
              setError("");
            }}
          >
            ← Quay lại
          </button>
          <div>
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => void saveReview()}
            >
              {busy ? "Đang lưu..." : "Lưu chỉnh sửa"}
            </button>
            <button
              className="button button-primary"
              disabled={busy || !analysisId || (report?.valid === false && !reviewDirty)}
              onClick={() => void confirmAndRun()}
            >
              {busy ? (
                "Đang xử lý..."
              ) : (
                <>
                  Xác nhận và xử lý <span>→</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>
      <aside className="review-side">
        <div className="panel side-summary">
          <div className="panel-kicker">TÓM TẮT PHIÊN</div>
          <h3>{title || files[0]?.name || "Tài liệu học tập"}</h3>
          <div className="summary-meta">
            <span>Chủ đề</span>
            <strong>
              {topicMode === "IT"
                ? "Công nghệ thông tin"
                : topicMode === "GENERAL"
                  ? "Chủ đề chung"
                  : "Tự nhận diện"}
            </strong>
          </div>
          <div className="summary-meta">
            <span>Mức phân tích</span>
            <strong>
              {depth === "quick"
                ? "Nhanh"
                : depth === "deep"
                  ? "Chuyên sâu"
                  : "Tiêu chuẩn"}
            </strong>
          </div>
          <div className="summary-meta">
            <span>Quiz ôn tập</span>
            <strong>{quizEnabled ? "Có" : "Không"}</strong>
          </div>
          <div className="summary-divider" />
          <p>
            <Icon>✦</Icon> Bạn có thể chỉnh sửa nội dung trích xuất trước khi
            xác nhận.
          </p>
        </div>
        <div className="panel review-assurance">
          <span className="assurance-icon">✓</span>
          <div>
            <strong>Chưa phân tích nội dung</strong>
            <p>
              Hình và công thức có thể đã được AI nhận diện. Phân tích học tập
              chỉ bắt đầu sau khi bạn xác nhận.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
