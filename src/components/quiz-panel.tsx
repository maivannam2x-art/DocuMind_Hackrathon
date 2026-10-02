"use client";
import { useMemo, useRef, useState } from "react";

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  difficulty?: string;
  question_type?: string;
};
export type QuizFeedback = {
  questionId: string;
  correct: boolean;
  answer: unknown;
  explanation: string | null;
};
export type QuizSubmission = {
  attempt: { score: number; total_questions: number };
  correctAnswers: number;
  feedback: QuizFeedback[];
};

const difficultyLabel = (value?: string) =>
  value === "easy" ? "Cơ bản" : value === "hard" ? "Nâng cao" : "Trung bình";

function verdict(score: number) {
  if (score >= 90) return "Xuất sắc! Bạn đã nắm rất chắc nội dung.";
  if (score >= 70) return "Tốt! Xem lại vài câu sai để hoàn thiện.";
  if (score >= 50) return "Khá ổn. Hãy đọc lại các mục liên quan rồi thử lại.";
  return "Cần ôn thêm. Mở phần Chi tiết để xem lại căn cứ trong tài liệu.";
}

export function QuizPanel({
  questions,
  quizEnabled,
  requestedCount,
  onLoadAttempts,
  loadError,
  reloading,
  onReload,
  onSubmit,
  onOpenDetail,
}: {
  questions: QuizQuestion[];
  requestedCount?: number;
  onLoadAttempts?: () => Promise<
    Array<{
      id: string;
      score: number;
      total_questions: number;
      submitted_at: string;
    }>
  >;
  quizEnabled: boolean;
  loadError: string;
  reloading: boolean;
  onReload: () => void;
  onSubmit: (answers: Record<string, number>) => Promise<QuizSubmission | null>;
  onOpenDetail: () => void;
}) {
  const [attempts, setAttempts] = useState<Array<{
    id: string;
    score: number;
    total_questions: number;
    submitted_at: string;
  }> | null>(null);
  const [attemptError, setAttemptError] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const feedbackById = useMemo(
    () =>
      new Map((result?.feedback ?? []).map((item) => [item.questionId, item])),
    [result],
  );
  const answered = questions.filter(
    (question) => answers[question.id] !== undefined,
  ).length;
  const wrongCount = result
    ? result.feedback.filter((item) => !item.correct).length
    : 0;
  const visible =
    onlyWrong && result
      ? questions.filter(
          (question) => feedbackById.get(question.id)?.correct === false,
        )
      : questions;

  const jumpTo = (id: string) =>
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });

  async function submit() {
    const missing = questions.find(
      (question) => answers[question.id] === undefined,
    );
    if (missing) {
      setShowMissing(true);
      jumpTo(missing.id);
      return;
    }
    setSubmitting(true);
    try {
      const response = await onSubmit(answers);
      if (response) {
        setResult(response);
        setShowMissing(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function retry(wrongOnly: boolean) {
    if (wrongOnly && result) {
      const wrong = new Set(
        result.feedback
          .filter((item) => !item.correct)
          .map((item) => item.questionId),
      );
      setAnswers((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => !wrong.has(id)),
        ),
      );
    } else setAnswers({});
    setResult(null);
    setOnlyWrong(false);
    setShowMissing(false);
  }

  if (!questions.length)
    return (
      <article className="panel quiz-panel">
        <div className="panel-kicker">ÔN TẬP TƯƠNG TÁC</div>
        <h2>Kiểm tra kiến thức</h2>
        {loadError && (
          <div className="inline-error" role="alert">
            {loadError}
            <button onClick={onReload}>Tạo hoặc tải lại quiz</button>
          </div>
        )}
        {quizEnabled ? (
          <div className="empty-state compact-empty">
            <h3>Quiz chưa sẵn sàng</h3>
            <p>Hệ thống sẽ tạo quiz từ những phần tài liệu đã lưu.</p>
            <button
              className="button button-secondary"
              disabled={reloading}
              onClick={onReload}
            >
              {reloading ? "Đang tạo..." : "Tạo lại quiz"}
            </button>
          </div>
        ) : (
          <div className="empty-inline">Phiên này không yêu cầu tạo quiz.</div>
        )}
        {requestedCount && questions.length < requestedCount && (
          <p className="validation-message validation-warning">
            Nguồn tạo được {questions.length}/{requestedCount} câu sau kiểm tra
            và loại trùng. Không bổ sung câu không có căn cứ để đủ số lượng.
          </p>
        )}
        {onLoadAttempts && (
          <button
            className="button button-secondary"
            onClick={() => {
              setAttemptError("");
              void onLoadAttempts()
                .then(setAttempts)
                .catch(() =>
                  setAttemptError("Không tải được lịch sử. Hãy thử lại."),
                );
            }}
          >
            Lịch sử làm quiz
          </button>
        )}
        {attemptError && <p role="alert">{attemptError}</p>}
        {attempts && (
          <div className="quiz-attempt-history">
            <h3>Các lần làm gần đây</h3>
            {attempts.length ? (
              attempts.map((a) => (
                <p key={a.id}>
                  {new Date(a.submitted_at).toLocaleString("vi-VN")} · {a.score}
                  % · {a.total_questions} câu
                </p>
              ))
            ) : (
              <p>Chưa có lượt nộp bài.</p>
            )}
          </div>
        )}
      </article>
    );

  const score = result?.attempt.score ?? 0;
  return (
    <article className="panel quiz-panel">
      <div className="panel-kicker">ÔN TẬP TƯƠNG TÁC</div>
      <h2>Kiểm tra kiến thức</h2>
      <p>
        Chọn một đáp án cho mỗi câu. Đáp án được chấm trên máy chủ và đối chiếu
        với tài liệu.
      </p>
      {loadError && (
        <div className="inline-error" role="alert">
          {loadError}
          <button onClick={onReload}>Tạo hoặc tải lại quiz</button>
        </div>
      )}

      {result ? (
        <section className="quiz-score-card" aria-live="polite">
          <div
            className="quiz-score-ring"
            style={{ ["--score" as string]: `${score * 3.6}deg` }}
          >
            <strong>{score}%</strong>
          </div>
          <div className="quiz-score-copy">
            <strong>
              {result.correctAnswers}/{result.attempt.total_questions} câu đúng
            </strong>
            <p>{verdict(score)}</p>
            <div className="quiz-score-actions">
              {wrongCount > 0 && (
                <button
                  className={`chip ${onlyWrong ? "chip-active" : ""}`}
                  onClick={() => setOnlyWrong((value) => !value)}
                >
                  {onlyWrong
                    ? "Hiện tất cả câu"
                    : `Chỉ xem ${wrongCount} câu sai`}
                </button>
              )}
              {wrongCount > 0 && (
                <button className="chip" onClick={() => retry(true)}>
                  Làm lại câu sai
                </button>
              )}
              <button className="chip" onClick={() => retry(false)}>
                Làm lại từ đầu
              </button>
              <button className="chip" onClick={onOpenDetail}>
                Xem lại tài liệu →
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div
          className="quiz-progress"
          aria-label={`Đã trả lời ${answered}/${questions.length} câu`}
        >
          <div className="quiz-progress-head">
            <span>
              Đã trả lời{" "}
              <strong>
                {answered}/{questions.length}
              </strong>
            </span>
            <span>{Math.round((answered / questions.length) * 100)}%</span>
          </div>
          <div className="quiz-progress-bar">
            <i style={{ width: `${(answered / questions.length) * 100}%` }} />
          </div>
        </div>
      )}

      <nav className="quiz-dots" aria-label="Chuyển nhanh tới câu hỏi">
        {questions.map((question, index) => {
          const feedback = feedbackById.get(question.id);
          const state = feedback
            ? feedback.correct
              ? "dot-right"
              : "dot-wrong"
            : answers[question.id] !== undefined
              ? "dot-done"
              : showMissing
                ? "dot-missing"
                : "";
          return (
            <button
              key={question.id}
              className={`quiz-dot ${state}`}
              onClick={() => jumpTo(question.id)}
              aria-label={`Câu ${index + 1}`}
            >
              {index + 1}
            </button>
          );
        })}
      </nav>

      {visible.map((question) => {
        const index = questions.indexOf(question);
        const feedback = feedbackById.get(question.id);
        const missing = showMissing && answers[question.id] === undefined;
        return (
          <div
            className={`quiz-question ${missing ? "quiz-missing" : ""}`}
            key={question.id}
            ref={(node) => {
              refs.current[question.id] = node;
            }}
          >
            <div className="quiz-q-meta">
              <span>
                CÂU {String(index + 1).padStart(2, "0")}
                {question.question_type === "true_false" ? " · ĐÚNG/SAI" : ""}
              </span>
              <small
                className={`difficulty difficulty-${question.difficulty ?? "medium"}`}
              >
                {difficultyLabel(question.difficulty)}
              </small>
            </div>
            <h3>{question.prompt}</h3>
            <div
              className="quiz-options"
              role="radiogroup"
              aria-label={`Đáp án câu ${index + 1}`}
            >
              {question.options.map((option, optionIndex) => {
                const chosen = answers[question.id] === optionIndex;
                const isAnswer =
                  feedback && Number(feedback.answer) === optionIndex;
                return (
                  <label
                    key={optionIndex}
                    className={`${chosen ? "selected" : ""} ${isAnswer ? "right-answer" : ""} ${feedback && chosen && !feedback.correct ? "wrong-answer" : ""}`}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      checked={chosen}
                      disabled={Boolean(result)}
                      onChange={() =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: optionIndex,
                        }))
                      }
                    />
                    <span className="option-letter">
                      {String.fromCharCode(65 + optionIndex)}
                    </span>
                    <span>{option}</span>
                    {isAnswer && <b>✓</b>}
                  </label>
                );
              })}
            </div>
            {missing && (
              <p className="quiz-missing-note">
                Bạn chưa chọn đáp án cho câu này.
              </p>
            )}
            {feedback?.explanation && (
              <p
                className={`quiz-explanation ${feedback.correct ? "" : "incorrect"}`}
              >
                <strong>
                  {feedback.correct ? "Chính xác." : "Chưa chính xác."}
                </strong>{" "}
                {feedback.explanation}
              </p>
            )}
          </div>
        );
      })}

      {!result && (
        <div className="quiz-submit-row">
          <span className="quiz-submit-hint">
            {answered < questions.length
              ? `Còn ${questions.length - answered} câu chưa trả lời`
              : "Đã trả lời đủ, sẵn sàng nộp bài"}
          </span>
          <button
            className="button button-primary"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? (
              <>
                <span className="spinner" />
                Đang chấm...
              </>
            ) : (
              "Nộp bài quiz →"
            )}
          </button>
        </div>
      )}
      {requestedCount && questions.length < requestedCount && (
        <p className="validation-message validation-warning">
          Nguồn tạo được {questions.length}/{requestedCount} câu sau kiểm tra và
          loại trùng. Không bổ sung câu không có căn cứ để đủ số lượng.
        </p>
      )}
      {onLoadAttempts && (
        <button
          className="button button-secondary"
          onClick={() => {
            setAttemptError("");
            void onLoadAttempts()
              .then(setAttempts)
              .catch(() =>
                setAttemptError("Không tải được lịch sử. Hãy thử lại."),
              );
          }}
        >
          Lịch sử làm quiz
        </button>
      )}
      {attemptError && <p role="alert">{attemptError}</p>}
      {attempts && (
        <div className="quiz-attempt-history">
          <h3>Các lần làm gần đây</h3>
          {attempts.length ? (
            attempts.map((a) => (
              <p key={a.id}>
                {new Date(a.submitted_at).toLocaleString("vi-VN")} · {a.score}%
                · {a.total_questions} câu
              </p>
            ))
          ) : (
            <p>Chưa có lượt nộp bài.</p>
          )}
        </div>
      )}
    </article>
  );
}
