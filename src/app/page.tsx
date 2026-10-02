"use client";
import { SourceFilesPanel } from "@/components/source-files-panel";
import { ActivityPanel } from "@/components/activity-panel";
import { ResultTabs } from "@/components/workspace/result-tabs";
import { AuthDialog } from "@/components/auth-dialog";
import { useWorkspace } from "@/hooks/use-workspace";
import { InputScreen } from "@/components/workspace/input-screen";
import { ReviewScreen } from "@/components/workspace/review-screen";
import { ProcessingScreen } from "@/components/workspace/processing-screen";
import { HistoryScreen } from "@/components/workspace/history-screen";
import { ResultWorkspace } from "@/components/workspace/result-workspace";
export default function Home() {
  const workspace = useWorkspace();
  const {
    setScreen,
    setError,
    screen,
    Icon,
    activeResultTab,
    setActiveResultTab,
    analysis,
    quizQuestions,
    loadHistory,
    history,
    setAuthMode,
    authUser,
    accountInitial,
    accountName,
    busy,
    reviewDirty,
    signOutFromHeader,
    authReady,
    setToast,
    heading,
    steps,
    stepIndex,
    error,
    pendingUploads,
    pendingIngestId,
    retryIncompleteUpload,
    toast,
    loadingLabel,
    authMode,
    setAccountDisplayName,
  } = workspace;
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            setScreen("input");
            setError("");
          }}
        >
          <span className="brand-mark">D</span>
          <span>DocuMind</span>
        </a>
        <div className="side-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav className="side-nav" aria-label="Điều hướng chính">
          <button
            className={`nav-item ${screen !== "history" && screen !== "result" ? "active" : ""}`}
            onClick={() => {
              setScreen("input");
              setError("");
            }}
          >
            <Icon>＋</Icon>Phân tích mới
          </button>
          {screen === "result" && (
            <ResultTabs
              active={activeResultTab}
              onSelect={setActiveResultTab}
              quizEnabled={Boolean(analysis?.quiz_enabled)}
              quizCount={quizQuestions.length}
            />
          )}
          <button
            className={`nav-item ${screen === "history" ? "active" : ""}`}
            onClick={() => void loadHistory()}
          >
            <Icon>▦</Icon>Lịch sử{" "}
            <span className="nav-count">{history.length || ""}</span>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <div className="tip-icon">✦</div>
          <strong>Tài liệu của bạn</strong>
          <p>được lưu theo từng phiên để tiếp tục học bất cứ lúc nào.</p>
          <button onClick={() => void loadHistory()}>
            Xem lịch sử <span>→</span>
          </button>
        </div>
        <button
          type="button"
          className="profile-row"
          onClick={() => setAuthMode(authUser ? "profile" : "sign-in")}
          aria-label={
            authUser ? "Mở hồ sơ tài khoản" : "Đăng nhập hoặc đăng ký"
          }
        >
          <div className="avatar">{authUser ? accountInitial : "DM"}</div>
          <div>
            <strong>
              {authUser ? accountName : "Đang dùng với tư cách khách"}
            </strong>
            <small>
              {authUser ? authUser.email : "Đăng nhập để lưu lịch sử"}
            </small>
          </div>
          <span className="profile-dots">{authUser ? "⌄" : "↗"}</span>
        </button>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>DocuMind</span>
            <b>/</b>
            <strong>
              {screen === "result"
                ? (analysis?.title ?? "Workspace")
                : screen === "review"
                  ? "Kiểm tra đầu vào"
                  : screen === "history"
                    ? "Lịch sử"
                    : "Phân tích mới"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="save-state">
              <i />
              {screen === "review"
                ? busy
                  ? "Đang xử lý..."
                  : reviewDirty
                    ? "Có chỉnh sửa chưa lưu"
                    : "Nội dung đã lưu"
                : screen === "result"
                  ? "Kết quả đã lưu"
                  : "Workspace tài liệu"}
            </span>
            {authUser ? (
              <>
                <button
                  type="button"
                  className="auth-account-button"
                  onClick={() => setAuthMode("profile")}
                  title="Hồ sơ tài khoản"
                >
                  <span className="auth-avatar">{accountInitial}</span>
                  <span className="auth-account-name">{accountName}</span>
                </button>
                <button
                  type="button"
                  className="auth-logout-button"
                  onClick={() => void signOutFromHeader()}
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="auth-login-button"
                  onClick={() => setAuthMode("sign-in")}
                  disabled={!authReady}
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  className="auth-signup-button"
                  onClick={() => setAuthMode("sign-up")}
                  disabled={!authReady}
                >
                  Tạo tài khoản
                </button>
              </>
            )}
            <button
              className="help-button"
              title="Trợ giúp"
              onClick={() =>
                setToast(
                  "Luồng gồm nhập tài liệu, kiểm tra, xác nhận xử lý và xem kết quả.",
                )
              }
            >
              ?
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-star">✦</span> TRỢ LÝ HỌC TẬP AI
              </div>
              <h1>{heading}</h1>
              <p>
                {screen === "input"
                  ? "Tải lên tài liệu hoặc dán nội dung. DocuMind sẽ giúp bạn hiểu sâu và ôn tập hiệu quả hơn."
                  : screen === "review"
                    ? "Xem nội dung đã trích xuất, chỉnh sửa nếu cần rồi xác nhận trước khi AI xử lý."
                    : screen === "history"
                      ? "Mở lại tài liệu, kết quả hoặc phiên xử lý đang dang dở."
                      : screen === "result"
                        ? "Các ý chính, phân tích và công cụ học tập từ tài liệu của bạn."
                        : analysis?.confirmed_at
                          ? "Tài liệu đã xác nhận. DocuMind đang phân tích theo từng phần."
                          : "Đang đọc đầu vào. Văn bản, bảng và hình được lưu theo checkpoint."}
              </p>
            </div>
            {screen === "result" && (
              <div className="header-export">
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => setActiveResultTab("report")}
                >
                  <Icon>↓</Icon> Xuất báo cáo
                </button>
              </div>
            )}
          </div>

          {screen !== "history" && (
            <div className="stepper" aria-label="Tiến độ phân tích">
              {steps.map((label, index) => (
                <div
                  className={`step ${index < stepIndex ? "done" : ""} ${index === stepIndex ? "current" : ""}`}
                  key={label}
                >
                  <span className="step-number">
                    {index < stepIndex ? "✓" : `0${index + 1}`}
                  </span>
                  <span className="step-name">{label}</span>
                  {index < steps.length - 1 && <i className="step-line" />}
                </div>
              ))}
            </div>
          )}

          {screen === "result" && (
            <ResultTabs
              variant="mobile"
              active={activeResultTab}
              onSelect={setActiveResultTab}
              quizEnabled={Boolean(analysis?.quiz_enabled)}
              quizCount={quizQuestions.length}
            />
          )}

          {screen !== "input" && screen !== "history" && (
            <>
              <ActivityPanel items={workspace.activities} />
              <SourceFilesPanel workspace={workspace} />
            </>
          )}

          {error && (
            <div className="alert alert-error" role="alert">
              <span>!</span>
              <div>
                <strong>Chưa thể hoàn tất bước này</strong>
                <p>{error}</p>
              </div>
              {(pendingUploads.length > 0 || pendingIngestId) && (
                <button
                  className="button button-secondary"
                  disabled={busy}
                  onClick={() => void retryIncompleteUpload()}
                >
                  Tiếp tục tải tệp
                </button>
              )}
              <button onClick={() => setError("")} aria-label="Đóng">
                ×
              </button>
            </div>
          )}
          {toast && (
            <div className="alert alert-success" role="status">
              <span>✓</span>
              <div>{toast}</div>
              <button onClick={() => setToast("")} aria-label="Đóng">
                ×
              </button>
            </div>
          )}

          {screen === "input" && <InputScreen workspace={workspace} />}

          {screen === "review" && <ReviewScreen workspace={workspace} />}

          {screen === "processing" && (
            <ProcessingScreen workspace={workspace} />
          )}

          {screen === "history" && <HistoryScreen workspace={workspace} />}

          {screen === "result" && <ResultWorkspace workspace={workspace} />}

          {busy && loadingLabel && screen !== "processing" && (
            <div className="busy-bar">
              <span className="spinner" />
              {loadingLabel}
            </div>
          )}
        </div>
        <footer className="app-footer">
          <span>© 2026 DocuMind</span>
          <span>
            <i />
            Hệ thống học tập từ tài liệu
          </span>
          <button
            onClick={() =>
              setToast("Tài liệu chỉ được phân tích sau khi bạn xác nhận.")
            }
          >
            Quyền riêng tư
          </button>
        </footer>
      </section>
      {authMode && (
        <AuthDialog
          key={authMode}
          initialMode={authMode}
          email={authUser?.email ?? undefined}
          onClose={() => setAuthMode(null)}
          onAuthenticated={(profile) => {
            if (profile?.displayName)
              setAccountDisplayName(profile.displayName);
            setToast(
              authMode === "profile"
                ? "Hồ sơ đã cập nhật."
                : "Bạn đã đăng nhập vào DocuMind.",
            );
          }}
        />
      )}
    </main>
  );
}
