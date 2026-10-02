"use client";
import { UsageMetrics } from "./usage-metrics";
import type { WorkspaceContext } from "@/hooks/use-workspace";
import { ResultBlockView } from "@/components/result-block";
import { QuizPanel } from "@/components/quiz-panel";
import { ChatPanel } from "@/components/chat-panel";
import { DetailView } from "@/components/detail-view";

export function ResultWorkspace({
  workspace,
}: {
  workspace: WorkspaceContext;
}) {
  const {
    analysisId,
    analysis,
    quizConfig,
    report,
    result,
    resultId,
    activeResultTab,
    setActiveResultTab,
    summaryVisible,
    setSummaryVisible,
    conclusionVisible,
    setConclusionVisible,
    quizQuestions,
    quizLoadError,
    chatLoadError,
    quizReloading,
    chat,
    chatPending,
    busy,
    resultOverview,
    resultSummary,
    resultConclusion,
    submitQuiz,
    sendChat,
    reloadQuiz,
    reloadChat,
    exportResult,
    formatDate,
    api,
  } = workspace;
  if (!result) return null;
  return (
    <div
      id="result-content"
      role="tabpanel"
      aria-labelledby={`result-tab-${activeResultTab}`}
      tabIndex={0}
      className={`results-layout ${["chat", "report"].includes(activeResultTab) ? "single-result" : ""}`}
    >
      <div className="result-column">
        <div className="result-meta-line">
          <span className="status-pill status-ok">✓ Hoàn thành</span>
          <span>{analysis?.title || result.title || "Tài liệu"}</span>
          <span className="meta-dot">·</span>
          <span>{(report?.totalWords ?? 0).toLocaleString("vi-VN")} từ</span>
          <span className="meta-dot">·</span>
          <span>{(result.sections ?? []).length} mục</span>
        </div>
        {activeResultTab === "overview" && (
          <>
            <div className="metric-grid">
              <div className="metric-card">
                <span className="metric-icon violet">✦</span>
                <small>PHẦN PHÂN TÍCH</small>
                <strong>{result.sections?.length ?? 0}</strong>
                <span>mục nội dung</span>
              </div>
              <div className="metric-card">
                <span className="metric-icon blue">▤</span>
                <small>ĐỘ DÀI TÀI LIỆU</small>
                <strong>
                  {(report?.totalWords ?? 0).toLocaleString("vi-VN")}
                </strong>
                <span>từ được xử lý</span>
              </div>
              <div className="metric-card">
                <span className="metric-icon green">✓</span>
                <small>TRẠNG THÁI</small>
                <strong className="metric-word">Hoàn thành</strong>
                <span>{formatDate(analysis?.completed_at)}</span>
              </div>
            </div>
            <UsageMetrics analysisId={analysisId} />
            <article className="panel key-takeaways">
              <div className="result-section-head">
                <div>
                  <div className="panel-kicker">ĐIỀU BẠN CẦN BIẾT</div>
                  <h2>Tổng quan ngắn</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActiveResultTab("summary")}
                >
                  Xem theo từng mục →
                </button>
              </div>
              <p className="summary-copy overview-lead">{resultSummary}</p>
              <div className="takeaway-list">
                {resultOverview?.highlights.map((point, index) => (
                  <div key={`${point.title}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{point.title}</strong>
                      <p>{point.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <div className="result-shortcuts">
              <button onClick={() => setActiveResultTab("detail")}>
                <span>☷</span>
                <strong>Đọc phân tích chi tiết</strong>
                <i>→</i>
              </button>
              <button onClick={() => setActiveResultTab("conclusion")}>
                <span>✓</span>
                <strong>Xem kết luận</strong>
                <i>→</i>
              </button>
              {analysis?.quiz_enabled && (
                <button onClick={() => setActiveResultTab("quiz")}>
                  <span>✧</span>
                  <strong>
                    {quizQuestions.length
                      ? `Làm quiz (${quizQuestions.length} câu)`
                      : "Mở quiz ôn tập"}
                  </strong>
                  <i>→</i>
                </button>
              )}
              <button onClick={() => setActiveResultTab("chat")}>
                <span>✦</span>
                <strong>Hỏi tiếp về tài liệu</strong>
                <i>→</i>
              </button>
              <button onClick={() => setActiveResultTab("report")}>
                <span>↓</span>
                <strong>Tải báo cáo</strong>
                <i>→</i>
              </button>
            </div>
          </>
        )}

        {activeResultTab === "summary" && (
          <article className="panel result-article">
            <div className="panel-kicker">TÓM TẮT TÀI LIỆU</div>
            <h2>{result.title || analysis?.title || "Tóm tắt"}</h2>
            <p className="summary-copy overview-lead">{resultSummary}</p>
            <h3 className="summary-subheading">Các ý quan trọng</h3>
            <div className="summary-highlights">
              {resultOverview?.highlights.map((point, index) => (
                <div key={`${point.title}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{point.title}</strong>
                    <p>{point.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <h3 className="summary-subheading">Tóm tắt theo đề mục</h3>
            <p className="summary-count">
              Hiển thị {Math.min(summaryVisible, result.sections.length)} /{" "}
              {result.sections.length} mục. Mở Chi tiết để xem đầy đủ bảng, sơ
              đồ, công thức và nội dung nguồn.
            </p>
            {result.sections.slice(0, summaryVisible).map((section, index) => (
              <section
                className="article-section summary-section"
                key={`${section.title}-${index}`}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{section.title}</h3>
                  <p>
                    {section.summary?.trim() ||
                      "Mục này có nội dung phân tích chi tiết; xem nguồn ở tab Chi tiết."}
                  </p>
                </div>
              </section>
            ))}
            {summaryVisible < result.sections.length && (
              <button
                className="button button-secondary load-more"
                onClick={() => setSummaryVisible((count) => count + 20)}
              >
                Xem thêm 20 mục →
              </button>
            )}
          </article>
        )}

        {activeResultTab === "detail" && (
          <DetailView
            sections={result.sections}
            analysisId={analysisId ?? undefined}
            resultId={resultId ?? undefined}
          />
        )}

        {activeResultTab === "conclusion" && (
          <article className="panel conclusion-panel">
            <div className="conclusion-heading">
              <span className="conclusion-mark">✓</span>
              <div>
                <div className="panel-kicker">KẾT LUẬN TỔNG HỢP</div>
                <h2>
                  {result.title || analysis?.title || "Điều rút ra từ tài liệu"}
                </h2>
              </div>
            </div>
            <p className="conclusion-copy">{resultConclusion}</p>
            <div className="conclusion-highlights">
              <h3>Các điểm đã được phân tích</h3>
              {result.sections
                .slice(0, conclusionVisible)
                .map((section, index) => (
                  <div
                    className="conclusion-highlight"
                    key={`${section.title}-${index}`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{section.title}</strong>
                      <p>
                        {section.summary ||
                          "Xem nội dung nguồn trong phần Chi tiết."}
                      </p>
                    </div>
                  </div>
                ))}
              {conclusionVisible < result.sections.length && (
                <button
                  className="button button-secondary load-more"
                  onClick={() => setConclusionVisible((count) => count + 20)}
                >
                  Xem thêm kết luận →
                </button>
              )}
            </div>
            <div className="conclusion-actions">
              <button
                className="button button-secondary"
                onClick={() => setActiveResultTab("detail")}
              >
                Quay lại phân tích chi tiết
              </button>
              {analysis?.quiz_enabled && (
                <button
                  className="button button-primary"
                  onClick={() => setActiveResultTab("quiz")}
                >
                  Ôn tập với quiz →
                </button>
              )}
            </div>
          </article>
        )}

        {activeResultTab === "quiz" && (
          <QuizPanel
            requestedCount={quizConfig.questionCount}
            onLoadAttempts={async () =>
              (
                await api<{
                  attempts: Array<{
                    id: string;
                    score: number;
                    total_questions: number;
                    submitted_at: string;
                  }>;
                }>(`/api/analyses/${analysisId}/quiz/attempts`)
              ).attempts
            }
            key={resultId ?? analysisId ?? "quiz"}
            questions={quizQuestions}
            quizEnabled={Boolean(analysis?.quiz_enabled)}
            loadError={quizLoadError}
            reloading={quizReloading}
            onReload={() => void reloadQuiz()}
            onSubmit={submitQuiz}
            onOpenDetail={() => setActiveResultTab("detail")}
          />
        )}

        {activeResultTab === "chat" && (
          <ChatPanel
            className="panel chat-workspace"
            messages={chat}
            pending={chatPending}
            loadError={chatLoadError}
            onSend={sendChat}
            onReload={() => void reloadChat()}
          />
        )}

        {activeResultTab === "report" && (
          <section className="panel report-workspace">
            <div className="panel-kicker">BÁO CÁO PHÂN TÍCH</div>
            <h2>Xuất báo cáo</h2>
            <p>
              Chọn định dạng tải xuống. Bản xem trước dưới đây là nội dung sẽ
              được đưa vào báo cáo.
            </p>
            <div className="report-format-grid">
              {[
                {
                  id: "pdf",
                  name: "PDF",
                  detail: "Bản trình bày để đọc và chia sẻ",
                },
                {
                  id: "docx",
                  name: "Word (.docx)",
                  detail: "Có thể chỉnh sửa trong Microsoft Word",
                },
                {
                  id: "markdown",
                  name: "Markdown + ảnh (.zip)",
                  detail: "Tài liệu văn bản cho ghi chú và kỹ thuật",
                },
                {
                  id: "html",
                  name: "HTML",
                  detail: "Trang báo cáo có định dạng",
                },
                {
                  id: "json",
                  name: "JSON",
                  detail: "Dữ liệu có cấu trúc cho tích hợp kỹ thuật",
                },
              ].map((format) => (
                <article className="report-format-card" key={format.id}>
                  <span className="report-format-icon">
                    {format.id === "pdf"
                      ? "PDF"
                      : format.id === "docx"
                        ? "W"
                        : format.id === "json"
                          ? "{}"
                          : format.id.toUpperCase()}
                  </span>
                  <div>
                    <strong>{format.name}</strong>
                    <p>{format.detail}</p>
                  </div>
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() =>
                      void exportResult(
                        format.id as
                          | "pdf"
                          | "docx"
                          | "markdown"
                          | "html"
                          | "json",
                      )
                    }
                  >
                    {busy ? "Đang tạo..." : "Tải xuống"}
                  </button>
                </article>
              ))}
            </div>
            <div className="report-preview">
              <div className="report-preview-head">
                <span className="panel-kicker">XEM TRƯỚC ĐẦY ĐỦ</span>
                <span>{result.sections.length} mục · Tiếng Việt</span>
              </div>
              <h1>{result.title || analysis?.title || "Báo cáo học tập"}</h1>
              <p>{resultSummary}</p>
              {result.sections.map((section, index) => (
                <section key={`${section.title}-${index}`}>
                  <h3>
                    {index + 1}. {section.title}
                  </h3>
                  {section.summary && <p>{section.summary}</p>}
                  {section.blocks.map((block, blockIndex) => (
                    <ResultBlockView
                      block={block}
                      analysisId={analysisId ?? undefined}
                      resultId={resultId ?? undefined}
                      key={`${block.type}-${blockIndex}`}
                    />
                  ))}
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
      {!["chat", "report"].includes(activeResultTab) && (
        <aside className="result-aside">
          <section className="panel topic-card">
            <div className="topic-card-top">
              <span>✦</span>
              <small>CHỦ ĐỀ NHẬN DIỆN</small>
            </div>
            <h3>
              {String(
                result.metadata?.topicName ??
                  (analysis?.topic_id ? "Công nghệ thông tin" : "Chủ đề chung"),
              )}
            </h3>
            <p>
              {result.metadata?.promptScope === "general_fallback"
                ? "Dùng prompt chung · kết quả ít chuyên sâu hơn phân tích IT."
                : result.metadata?.promptScope === "it_specialized"
                  ? "Đang dùng prompt chuyên sâu cho tài liệu IT."
                  : "Phân tích bám sát tài liệu nguồn."}
            </p>
            <div className="topic-badge">
              {result.metadata?.promptScope === "general_fallback"
                ? "Chủ đề chung"
                : result.metadata?.promptScope === "it_specialized"
                  ? "Chuyên sâu IT"
                  : "Đã phân tích"}
            </div>
          </section>
          <section className="panel chat-quick">
            <div className="chat-heading">
              <span className="chat-spark">✦</span>
              <div>
                <h3>Hỏi đáp cùng AI</h3>
                <small>Dựa trên tài liệu đã phân tích</small>
              </div>
            </div>
            {chatLoadError ? (
              <div className="inline-error">
                {chatLoadError}
                <button onClick={() => void reloadChat()}>Thử lại</button>
              </div>
            ) : (
              <p>Đặt câu hỏi để làm rõ khái niệm hoặc tìm ý trong tài liệu.</p>
            )}
            <button
              className="button button-secondary"
              onClick={() => setActiveResultTab("chat")}
            >
              Mở chatbot →
            </button>
          </section>
        </aside>
      )}
    </div>
  );
}
