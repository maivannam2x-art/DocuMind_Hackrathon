"use client";
import type { WorkspaceContext } from "@/hooks/use-workspace";

export function ProcessingScreen({
  workspace,
}: {
  workspace: WorkspaceContext;
}) {
  const {
    analysis,
    title,
    operation,
    progress,
    busy,
    loadingLabel,
    confirmAndRun,
    retryIncompleteUpload,
    pendingIngestId,
    setScreen,
  } = workspace;
  const confirmed = Boolean(analysis?.confirmed_at);
  const readComplete = Boolean(
    progress && progress.completed >= progress.total,
  );
  const steps = confirmed
    ? [
        { label: "Xác nhận tài liệu", done: true },
        { label: "Nhận diện chủ đề", done: Boolean(progress) },
        {
          label: progress
            ? `Phân tích ${progress.total} phần nội dung`
            : "Phân tích từng phần nội dung",
          done: readComplete,
        },
        {
          label: analysis?.quiz_enabled
            ? "Tổng hợp kết quả và tạo quiz"
            : "Tổng hợp kết quả",
          done: false,
        },
      ]
    : [
        { label: "Đọc văn bản, bảng, ảnh và công thức", done: readComplete },
        { label: "Kiểm tra và dựng cấu trúc tài liệu", done: false },
        { label: "Chờ bạn rà soát và xác nhận", done: false },
      ];

  return (
    <div className="processing-wrap">
      <div className="panel processing-card">
        <div className="processing-illustration">
          <span className="orbit orbit-a" />
          <span className="orbit orbit-b" />
          <span className="processing-core">✦</span>
          <span className="spark spark-a">✧</span>
          <span className="spark spark-b">✦</span>
        </div>
        <div className="panel-kicker">DOCUMIND ĐANG LÀM VIỆC</div>
        <h2>{loadingLabel || "Đang xử lý phiên của bạn"}</h2>
        <p>{analysis?.title || title || "Tài liệu học tập"}</p>
        <div
          className={`processing-progress ${progress ? "is-determinate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress?.total ?? 100}
          aria-valuenow={progress?.completed}
          aria-label="Tiến độ phân tích"
        >
          <i
            style={
              progress
                ? {
                    width: `${Math.max(4, (progress.completed / progress.total) * 100)}%`,
                  }
                : undefined
            }
          />
        </div>
        <div className="processing-status">
          <span>
            <i />
            {progress
              ? `${progress.completed}/${progress.total} phần · ${Math.round((progress.completed / progress.total) * 100)}%`
              : busy
                ? confirmed
                  ? "Đang phân tích nội dung"
                  : "Đang đọc và kiểm tra đầu vào"
                : "Đang chờ tiếp tục"}
          </span>
          <small>
            Bạn có thể đóng trang và mở lại phiên từ Lịch sử để tiếp tục.
          </small>
        </div>
        {!analysis?.confirmed_at && (
          <p>
            Đọc đầu vào: hệ thống parse văn bản/bảng Word/CSV; AI đọc trang PDF,
            ảnh và công thức cần nhận diện. Chưa chạy phân tích kiến thức trước
            khi bạn xác nhận.
          </p>
        )}
        <ol className="processing-steps">
          {steps.map((step, index, all) => {
            const current =
              !step.done && all.slice(0, index).every((item) => item.done);
            return (
              <li
                key={step.label}
                className={
                  step.done ? "done" : current && busy ? "current" : ""
                }
              >
                <span>{step.done ? "✓" : index + 1}</span>
                {step.label}
              </li>
            );
          })}
        </ol>
        {busy && (
          <button
            className="button button-secondary"
            onClick={() => operation.current?.abort()}
          >
            Tạm dừng sau lượt hiện tại
          </button>
        )}
        {!busy && !analysis?.confirmed_at && (
          <button
            className="button button-primary"
            onClick={() =>
              pendingIngestId
                ? void retryIncompleteUpload()
                : setScreen("input")
            }
          >
            {pendingIngestId
              ? "Tiếp tục đọc tài liệu"
              : "Chọn tài liệu khác / tạo phiên mới"}
          </button>
        )}
        {["ready", "failed", "processing"].includes(analysis?.status ?? "") &&
          Boolean(analysis?.confirmed_at) &&
          !busy && (
            <button
              className="button button-primary"
              onClick={() => void confirmAndRun()}
            >
              {analysis?.status === "failed"
                ? "Thử xử lý lại"
                : analysis?.status === "ready"
                  ? "Bắt đầu xử lý"
                  : "Tiếp tục xử lý"}{" "}
              <span>→</span>
            </button>
          )}
      </div>
    </div>
  );
}
