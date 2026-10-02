"use client";
import type { WorkspaceContext } from "@/hooks/use-workspace";

export function HistoryScreen({ workspace }: { workspace: WorkspaceContext }) {
  const {
    setScreen,
    history,
    historyQuery,
    setHistoryQuery,
    historyFilter,
    setHistoryFilter,
    busy,
    visibleHistory,
    openHistoryItem,
    HISTORY_FILTERS,
    formatDate,
    matchesHistoryFilter,
    statusLabel,
  } = workspace;

  return (
    <section className="history-list panel">
      <div className="panel-heading">
        <div>
          <div className="panel-kicker">WORKSPACE CÁ NHÂN</div>
          <h2>Các phiên gần đây</h2>
          <p>Mở lại phiên để xem kết quả hoặc tiếp tục chỉnh sửa.</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => setScreen("input")}
        >
          ＋ Phân tích mới
        </button>
      </div>
      {history.length > 0 && (
        <div className="history-toolbar">
          <label className="detail-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="Tìm theo tên phiên..."
              aria-label="Tìm phiên phân tích"
            />
          </label>
          <div
            className="history-filters"
            role="group"
            aria-label="Lọc theo trạng thái"
          >
            {HISTORY_FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`chip ${historyFilter === filter.id ? "chip-active" : ""}`}
                onClick={() => setHistoryFilter(filter.id)}
              >
                {filter.label}{" "}
                <b>
                  {
                    history.filter((item) =>
                      matchesHistoryFilter(item.status, filter.id),
                    ).length
                  }
                </b>
              </button>
            ))}
          </div>
        </div>
      )}
      {history.length === 0 ? (
        <div className="empty-state">
          <span>▤</span>
          <h3>Chưa có phiên phân tích</h3>
          <p>Tài liệu bạn xử lý sẽ được lưu tại đây.</p>
          <button
            className="button button-primary"
            onClick={() => setScreen("input")}
          >
            Bắt đầu phân tích <span>→</span>
          </button>
        </div>
      ) : visibleHistory.length === 0 ? (
        <div className="empty-inline">
          Không có phiên nào khớp bộ lọc hiện tại.
        </div>
      ) : (
        visibleHistory.map((item) => (
          <button
            className="history-row"
            key={item.id}
            disabled={busy}
            onClick={() => void openHistoryItem(item)}
          >
            <span
              className={`history-file ${item.status === "completed" ? "complete" : ""}`}
            >
              {item.status === "completed" ? "✓" : "▤"}
            </span>
            <span className="history-main">
              <strong>{item.title}</strong>
              <small>
                {item.quiz_enabled ? "Có quiz" : "Không có quiz"} ·{" "}
                {formatDate(item.updated_at || item.created_at)}
              </small>
            </span>
            <span
              className={`status-pill ${item.status === "completed" ? "status-ok" : item.status === "failed" ? "status-error" : "status-warn"}`}
            >
              {statusLabel(item.status)}
            </span>
            <span className="history-open">Mở phiên →</span>
          </button>
        ))
      )}
    </section>
  );
}
