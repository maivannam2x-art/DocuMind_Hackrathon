"use client";
import { SearchSelect } from "@/components/search-select";
import type { WorkspaceContext } from "@/hooks/use-workspace";

import type { QuizSettings } from "@/lib/quiz-settings";
export function InputScreen({ workspace }: { workspace: WorkspaceContext }) {
  const {
    files,
    setFiles,
    isDraggingFiles,
    setIsDraggingFiles,
    title,
    setTitle,
    text,
    setText,
    customPrompt,
    setCustomPrompt,
    topicMode,
    setTopicMode,
    specializationId,
    setSpecializationId,
    quizEnabled,
    setQuizEnabled,
    quizConfig,
    setQuizConfig,
    depth,
    setDepth,
    busy,
    loadingLabel,
    selectedTopic,
    createAnalysis,
    addFiles,
    onFileChange,
    Icon,
    FILE_ACCEPT,
  } = workspace;

  return (
    <form className="input-layout" onSubmit={createAnalysis}>
      <section className="panel input-panel">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">BẮT ĐẦU PHIÊN MỚI</div>
            <h2>Thiết lập phân tích</h2>
            <p>Chọn chủ đề và cho AI biết bạn muốn học điều gì.</p>
          </div>
          <span className="panel-index">01</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>Chủ đề tài liệu</span>
            <SearchSelect
              label="Chủ đề tài liệu"
              value={topicMode}
              onChange={(value) => {
                setTopicMode(value);
                setSpecializationId("");
              }}
              options={[
                { value: "AUTO", label: "Tự nhận diện chủ đề" },
                { value: "IT", label: "Công nghệ thông tin" },
                { value: "GENERAL", label: "Chủ đề chung" },
              ]}
            />
            <small>
              {topicMode === "IT"
                ? "Ưu tiên prompt kỹ thuật theo chuyên ngành IT."
                : "Ngoài IT hoặc chưa rõ chủ đề sẽ dùng prompt chung."}
            </small>
          </label>
          <label className="field">
            <span>Ngôn ngữ đầu ra</span>
            <select value="vi" disabled>
              <option value="vi">Tiếng Việt</option>
            </select>
            <small>Kết quả được tạo bằng tiếng Việt.</small>
          </label>
          {topicMode === "IT" && (
            <label className="field field-wide">
              <span>
                Chuyên ngành IT <em>Không bắt buộc</em>
              </span>
              <SearchSelect
                label="Chuyên ngành IT"
                value={specializationId}
                onChange={setSpecializationId}
                fallbackValue=""
                options={[
                  { value: "", label: "Tự nhận diện chuyên ngành" },
                  ...(selectedTopic?.specializations ?? []).map((item) => ({
                    value: item.id,
                    label: item.name,
                    description: item.description,
                  })),
                ]}
              />
              <small>
                Nếu không chọn, hệ thống sẽ nhận diện từ nội dung tài liệu.
              </small>
            </label>
          )}
          <label className="field field-wide">
            <span>
              Tên phiên phân tích <em>Không bắt buộc</em>
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Ví dụ: Lập trình hướng đối tượng với Java"
            />
          </label>
          <label className="field field-wide">
            <span>
              Yêu cầu AI <em>Không bắt buộc</em>
            </span>
            <textarea
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              maxLength={3000}
              rows={3}
              placeholder="Bạn muốn AI tập trung giải thích phần nào? Ví dụ: làm rõ luồng xử lý, thuật ngữ và ví dụ trong tài liệu..."
            />
            <small>
              {customPrompt.length}/3000 ký tự · AI luôn bám sát nội dung nguồn.
            </small>
          </label>
        </div>
        <div className="field-heading">
          <div>
            <span>Mức phân tích</span>
            <small>
              Nhanh: ý chính. Tiêu chuẩn: giải thích cân bằng. Chuyên sâu: cơ
              chế, điều kiện và giới hạn; Gemini suy nghĩ cao hơn khi model hỗ
              trợ.
            </small>
          </div>
        </div>
        <div
          className="depth-selector"
          role="radiogroup"
          aria-label="Mức phân tích"
        >
          {[
            { id: "quick", title: "Nhanh", sub: "Nắm ý chính", icon: "◷" },
            {
              id: "standard",
              title: "Tiêu chuẩn",
              sub: "Cân bằng nội dung",
              icon: "◈",
            },
            {
              id: "deep",
              title: "Chuyên sâu",
              sub: "Giải thích kỹ hơn",
              icon: "✦",
            },
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              className={`depth-option ${depth === item.id ? "chosen" : ""}`}
              role="radio"
              aria-checked={depth === item.id}
              onClick={() => setDepth(item.id)}
            >
              <span className="depth-icon">{item.icon}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.sub}</small>
              </span>
              <i className="radio-mark" />
            </button>
          ))}
        </div>
        <label className={`quiz-toggle ${quizEnabled ? "enabled" : ""}`}>
          <span className="quiz-toggle-icon">✧</span>
          <span>
            <strong>Tạo quiz ôn tập</strong>
            <small>Thêm câu hỏi trắc nghiệm dựa trên tài liệu.</small>
          </span>
          <input
            type="checkbox"
            checked={quizEnabled}
            onChange={(event) => setQuizEnabled(event.target.checked)}
          />
          <i className="switch" />
        </label>
        {quizEnabled && (
          <div className="quiz-config form-grid">
            <label className="field">
              <span>Số câu mong muốn</span>
              <input
                type="number"
                min={1}
                value={quizConfig.questionCount}
                onChange={(e) =>
                  setQuizConfig((c) => ({
                    ...c,
                    questionCount: Math.max(
                      1,
                      Math.trunc(Number(e.target.value) || 20),
                    ),
                  }))
                }
              />
              <small>
                Mặc định 20 câu. Bạn có thể nhập số lượng mong muốn; nguồn không
                đủ sẽ ghi rõ số câu thực tế.
              </small>
            </label>
            <label className="field">
              <span>Độ khó quiz</span>
              <SearchSelect
                label="Độ khó quiz"
                value={quizConfig.difficulty}
                onChange={(value) =>
                  setQuizConfig((c) => ({
                    ...c,
                    difficulty: value as QuizSettings["difficulty"],
                  }))
                }
                options={[
                  { value: "mixed", label: "Kết hợp" },
                  { value: "easy", label: "Dễ" },
                  { value: "medium", label: "Trung bình" },
                  { value: "hard", label: "Khó" },
                ]}
              />
            </label>
            <label className="field">
              <span>Loại câu hỏi</span>
              <SearchSelect
                label="Loại câu hỏi"
                value={
                  quizConfig.types.length === 2 ? "mixed" : quizConfig.types[0]
                }
                onChange={(value) =>
                  setQuizConfig((c) => ({
                    ...c,
                    types:
                      value === "mixed"
                        ? ["multiple_choice", "true_false"]
                        : [value as QuizSettings["types"][number]],
                  }))
                }
                options={[
                  { value: "multiple_choice", label: "Trắc nghiệm" },
                  { value: "true_false", label: "Đúng / sai" },
                  { value: "mixed", label: "Kết hợp" },
                ]}
              />
            </label>
          </div>
        )}
      </section>

      <section className="panel source-panel">
        <div className="panel-heading">
          <div>
            <div className="panel-kicker">NỘI DUNG ĐẦU VÀO</div>
            <h2>Tài liệu của bạn</h2>
            <p>Tải tệp hoặc dán nội dung để bắt đầu.</p>
          </div>
          <span className="panel-index">02</span>
        </div>
        <label
          className={`dropzone ${files.length ? "has-files" : ""} ${isDraggingFiles ? "is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingFiles(true);
          }}
          onDragLeave={() => setIsDraggingFiles(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingFiles(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <input
            type="file"
            multiple
            accept={FILE_ACCEPT}
            onChange={onFileChange}
          />
          <span className="upload-icon">
            <Icon>↑</Icon>
          </span>
          <strong>Kéo thả tệp vào đây</strong>
          <span>
            hoặc <b>chọn từ thiết bị</b>
          </span>
          <small>
            PDF, DOCX, TXT, Markdown, mã nguồn, PNG/JPG · Tối đa 10 tệp, 20 MB
            mỗi tệp
          </small>
        </label>
        {files.length > 0 && (
          <div className="file-list">
            {files.map((file, index) => (
              <div className="file-row" key={`${file.name}-${index}`}>
                <span className="file-type">
                  {file.name.split(".").pop()?.toUpperCase().slice(0, 4)}
                </span>
                <div className="file-meta">
                  <strong>{file.name}</strong>
                  <small>{(file.size / 1024).toFixed(0)} KB</small>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFiles((current) => current.filter((_, i) => i !== index))
                  }
                  aria-label={`Xóa ${file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="or-divider">
          <span>HOẶC DÁN NỘI DUNG</span>
        </div>
        <label className="field pasted-field">
          <span>Nội dung văn bản</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={7}
            maxLength={500000}
            placeholder="Dán nội dung tài liệu, ghi chú hoặc code vào đây..."
          />
          <small>
            {text.length.toLocaleString("vi-VN")} ký tự · Bạn có thể kết hợp văn
            bản và tệp.
          </small>
        </label>
        <div className="privacy-note">
          <Icon>◉</Icon>
          <span>
            Tài liệu riêng tư. AI đọc hình và công thức để tạo bản xem trước;
            phân tích nội dung sau khi bạn xác nhận.
          </span>
        </div>
        <button
          className="button button-primary button-full"
          disabled={busy || (!text.trim() && files.length === 0)}
          type="submit"
        >
          {busy ? (
            <>
              <span className="spinner" />
              {loadingLabel || "Đang chuẩn bị..."}
            </>
          ) : (
            <>
              Kiểm tra tài liệu <span>→</span>
            </>
          )}
        </button>
        <p className="button-footnote">
          Bước tiếp theo cho phép bạn xem và chỉnh sửa nội dung đã trích xuất.
        </p>
      </section>
    </form>
  );
}
