"use client";

import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ResultBlockView } from "@/components/result-block";
import { AuthDialog } from "@/components/auth-dialog";
import { blockToPlainText, type ResultBlock } from "@/lib/result-content";
import { getSupabaseAccessToken, getSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase-browser";

type Topic = { id: string; code: string; name: string; specializations: Array<{ id: string; name: string; parent_id: string | null; description?: string }> };
type ApiInput = { id: string; original_name: string; edited_text?: string | null; normalized_text?: string | null; original_text?: string | null; status?: string; metadata?: Record<string, unknown>; previewUrl?: string | null };
type OutlineItem = { chunkIndex: number; title: string; preview: string };
type InputReport = { id: string; name: string; characters: number; words: number; chunkCount: number; structure: OutlineItem[] };
type ValidationReport = { valid: boolean; totalCharacters: number; totalWords: number; inputCount: number; chunkCount: number; blockingErrors: Array<{ message: string }>; warnings: Array<{ message: string }>; notes: Array<{ message: string }>; inputs: InputReport[] };
type Analysis = { id: string; title: string; status: string; user_id?: string | null; confirmed_at?: string | null; topic_id?: string | null; specialization_id?: string | null; custom_prompt?: string | null; quiz_enabled?: boolean; validation_report?: ValidationReport; created_at?: string; updated_at?: string; completed_at?: string | null; error_code?: string | null; error_message?: string | null };
type HistoryRow = Pick<Analysis, "id" | "title" | "status" | "quiz_enabled" | "created_at" | "updated_at" | "completed_at" | "error_code">;
type Block = ResultBlock;
type Section = { title: string; summary?: string; blocks: Block[] };
type ResultJson = { title?: string; summary?: string; conclusion?: string; sections: Section[]; metadata?: Record<string, unknown> };
type ChatMessage = { id?: string; role: "user" | "assistant"; content: string; citations?: string[] };
type QuizQuestion = { id: string; prompt: string; options: string[]; difficulty?: string; question_type?: string };
type QuizFeedback = { questionId: string; correct: boolean; answer: unknown; explanation: string | null };
type SignedUpload = { inputId: string; name: string; signedUrl: string; mimeType: string; file: File };

const steps = ["Tài liệu", "Kiểm tra", "Xử lý", "Kết quả"];
const GUEST_ANALYSIS_STORAGE_KEY = "documind:guest-analysis-ids";
const guestAnalysisIds = new Set<string>();

function hasGuestAnalysisContext(path: string) {
  if (typeof window === "undefined") return false;
  const id = path.match(/^\/api\/analyses\/([^/?]+)/)?.[1];
  if (!id) return false;
  if (guestAnalysisIds.has(id)) return true;
  try {
    const ids = JSON.parse(window.sessionStorage.getItem(GUEST_ANALYSIS_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(ids) && ids.includes(id);
  } catch { return false; }
}

function rememberGuestAnalysis(id: string) {
  guestAnalysisIds.add(id);
  try {
    const ids = JSON.parse(window.sessionStorage.getItem(GUEST_ANALYSIS_STORAGE_KEY) ?? "[]") as unknown;
    const next = Array.isArray(ids) ? ids.filter((value): value is string => typeof value === "string") : [];
    if (!next.includes(id)) next.push(id);
    window.sessionStorage.setItem(GUEST_ANALYSIS_STORAGE_KEY, JSON.stringify(next.slice(-20)));
  } catch { /* Private browsing can disable sessionStorage; the active guest cookie remains available. */ }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = hasGuestAnalysisContext(path) ? null : await getSupabaseAccessToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, credentials: "include", headers });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { message?: string; details?: unknown } };
  if (!response.ok) throw new Error(payload.error?.message ?? `Yêu cầu thất bại (${response.status}).`);
  return payload.data as T;
}

function Icon({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`icon ${className}`} aria-hidden="true">{children}</span>;
}

function formatDate(value?: string | null) {
  if (!value) return "Vừa tạo";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { draft: "Bản nháp", needs_review: "Cần kiểm tra", ready: "Sẵn sàng xử lý", processing: "Đang xử lý", completed: "Hoàn thành", failed: "Bị gián đoạn", expired: "Đã hết hạn" };
  return labels[status] ?? status;
}

export default function Home() {
  const [screen, setScreen] = useState<"input" | "review" | "processing" | "result" | "history">("input");
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [pendingUploads, setPendingUploads] = useState<SignedUpload[]>([]);
  const [pendingIngestId, setPendingIngestId] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [topicMode, setTopicMode] = useState("AUTO");
  const [specializationId, setSpecializationId] = useState("");
  const [quizEnabled, setQuizEnabled] = useState(true);
  const [depth, setDepth] = useState("standard");
  const [inputRows, setInputRows] = useState<ApiInput[]>([]);
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [result, setResult] = useState<ResultJson | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState("overview");
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoadError, setQuizLoadError] = useState("");
  const [chatLoadError, setChatLoadError] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizFeedback, setQuizFeedback] = useState<QuizFeedback[] | null>(null);
  const [quizScore, setQuizScore] = useState<{ correctAnswers: number; attempt: { score: number; total_questions: number } } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up" | "profile" | null>(null);

  const selectedTopic = useMemo(() => topics.find(topic => topic.code === "IT"), [topics]);
  const selectedSpecialization = useMemo(() => selectedTopic?.specializations.find(item => item.id === specializationId), [selectedTopic, specializationId]);
  const allOutline = useMemo(() => report?.inputs.flatMap(input => input.structure) ?? outline, [report, outline]);
  const resultSummary = useMemo(() => result?.summary?.trim() || result?.sections.map(section => section.summary?.trim()).filter(Boolean).join("\n\n") || "Tóm tắt đang được tạo từ các phần nội dung bên dưới.", [result]);
  const resultConclusion = useMemo(() => result?.conclusion?.trim() || result?.summary?.trim() || result?.sections.map(section => section.summary?.trim()).filter(Boolean).at(-1) || "Kết luận chưa được tách riêng trong dữ liệu phân tích. Hãy xem lại các phần tổng hợp ở trên.", [result]);

  useEffect(() => {
    api<{ data: Topic[] }>("/api/topics").then(response => setTopics(response.data ?? [])).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig()) {
      setAuthReady(true);
      return;
    }
    const client = getSupabaseBrowserClient();
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      setAuthUser(session?.user ?? null);
      if (session && event === "SIGNED_IN") {
        window.setTimeout(() => {
          void api<{ email: string; displayName: string }>("/api/profile").then(profile => setAccountDisplayName(profile.displayName)).catch(() => undefined);
        }, 0);
      }
      setAuthReady(true);
      if (event === "SIGNED_OUT") {
        setAccountDisplayName("");
        setAnalysisId(null); setAnalysis(null); setResultId(null); setResult(null); setHistory([]);
        setScreen("input"); setActiveResultTab("overview"); setQuizQuestions([]); setChat([]);
        setToast("Đã đăng xuất. Phiên học riêng của tài khoản đã được đóng.");
      }
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
      if (data.session) {
        void api<{ email: string; displayName: string }>("/api/profile").then(profile => {
          if (active) setAccountDisplayName(profile.displayName);
        }).catch(() => undefined);
      } else setAccountDisplayName("");
      if (sessionError) setToast("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để mở lịch sử.");
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function signOutFromHeader() {
    setError("");
    try {
      const { error: signOutError } = await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
    } catch {
      setError("Không thể đăng xuất lúc này. Kiểm tra kết nối rồi thử lại.");
    }
  }

  const metadataName = typeof authUser?.user_metadata?.display_name === "string" ? authUser.user_metadata.display_name.trim() : "";
  const accountName = accountDisplayName || metadataName || authUser?.email || "Tài khoản DocuMind";
  const accountInitial = accountName.trim().charAt(0).toUpperCase() || "D";

  const loadResult = useCallback(async (id: string, analysisData?: Analysis) => {
    const resultResponse = await api<{ analysis: Analysis; result: { id: string; result_json: ResultJson } }>(`/api/analyses/${id}/result`);
    const current = analysisData ?? resultResponse.analysis;
    setAnalysis(current);
    setResultId(resultResponse.result.id);
    setResult(resultResponse.result.result_json);
    setScreen("result");
    setActiveResultTab("overview");
    const [quizResult, chatResult] = await Promise.allSettled([
      api<{ quiz: { id: string }; questions: QuizQuestion[] }>(`/api/analyses/${id}/quiz`),
      api<{ messages: ChatMessage[] }>(`/api/analyses/${id}/chat`),
    ]);
    if (quizResult.status === "fulfilled") {
      setQuizQuestions(quizResult.value.questions ?? []);
      setQuizLoadError(quizResult.value.questions?.length ? "" : current.quiz_enabled ? "Quiz đã được yêu cầu nhưng chưa có câu hỏi. Hãy thử tải lại hoặc chạy lại phân tích." : "");
    } else {
      setQuizQuestions([]);
      setQuizLoadError(current.quiz_enabled ? quizResult.reason instanceof Error ? quizResult.reason.message : "Không tải được quiz." : "");
    }
    if (chatResult.status === "fulfilled") { setChat(chatResult.value.messages ?? []); setChatLoadError(""); }
    else { setChat([]); setChatLoadError(chatResult.reason instanceof Error ? chatResult.reason.message : "Không tải được chatbot."); }
  }, []);

  const loadHistory = useCallback(async () => {
    setError("");
    try {
      const response = await api<{ items: HistoryRow[] }>("/api/analyses?limit=50");
      setHistory(response.items ?? []);
      setScreen("history");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được lịch sử."); }
  }, []);

  const refreshReview = useCallback(async (id: string) => {
    const validated = await api<{ status: string; report: ValidationReport }>(`/api/analyses/${id}/validate`, { method: "POST" });
    setReport(validated.report);
    setOutline(validated.report.inputs.flatMap(item => item.structure));
    const details = await api<{ analysis: Analysis; inputs: ApiInput[] }>(`/api/analyses/${id}?includeContent=true`);
    setAnalysis(details.analysis);
    setInputRows(details.inputs);
    setInputTexts(Object.fromEntries(details.inputs.map(input => [input.id, input.edited_text ?? input.normalized_text ?? input.original_text ?? ""])));
    setScreen("review");
  }, []);

  async function ingestAllFiles(id: string) {
    let nextStep: string;
    do {
      const response = await api<{ nextStep: string; remainingFiles: number }>(`/api/analyses/${id}/ingest`, { method: "POST" });
      nextStep = response.nextStep;
      if (nextStep === "ingest") setLoadingLabel(`Đang đọc tệp tiếp theo · còn ${response.remainingFiles} tệp...`);
    } while (nextStep === "ingest");
  }

  async function completeFileUploadAndReview(id: string, uploads: SignedUpload[]) {
    for (const upload of uploads) {
      const response = await fetch(upload.signedUrl, {
        method: "PUT",
        headers: { "content-type": upload.mimeType, "cache-control": "max-age=3600", "x-upsert": "true" },
        body: upload.file,
      });
      if (!response.ok) throw new Error(`Không tải được tệp “${upload.name}”. Kiểm tra kết nối rồi chọn tiếp tục tải tệp.`);
      setPendingUploads(current => current.filter(item => item.inputId !== upload.inputId));
    }
    setPendingIngestId(id);
    setLoadingLabel("Đang trích xuất văn bản, công thức và sơ đồ từ tệp...");
    await ingestAllFiles(id);
    setPendingIngestId(null);
    await refreshReview(id);
    setPendingUploads([]);
    setFiles([]);
    setText("");
  }

  async function retryIncompleteUpload() {
    if (!analysisId || (!pendingUploads.length && !pendingIngestId)) return;
    setBusy(true); setError("");
    try {
      if (pendingUploads.length) await completeFileUploadAndReview(analysisId, pendingUploads);
      else {
        setLoadingLabel("Đang trích xuất lại nội dung tệp...");
        await ingestAllFiles(analysisId);
        setPendingIngestId(null);
        await refreshReview(analysisId);
        setFiles([]); setText("");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tiếp tục tải và đọc tài liệu.");
    } finally { setBusy(false); setLoadingLabel(""); }
  }

  async function createAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analysisId && (pendingUploads.length || pendingIngestId)) { await retryIncompleteUpload(); return; }
    if (!text.trim() && files.length === 0) { setError("Dán nội dung hoặc chọn ít nhất một tệp để bắt đầu."); return; }
    setBusy(true); setError(""); setToast(""); setLoadingLabel("Đang lưu tài liệu và chuẩn bị kiểm tra...");
    try {
      const titleValue = title.trim() || files[0]?.name.replace(/\.[^.]+$/, "") || "Phân tích mới";
      const depthLabel = depth === "quick" ? "nhanh" : depth === "deep" ? "chuyên sâu" : "tiêu chuẩn";
      const prompt = [`Mức phân tích: ${depthLabel}.`, selectedSpecialization ? `Chuyên ngành IT đã chọn: ${selectedSpecialization.name}.` : "", customPrompt.trim()].filter(Boolean).join(" ");
      const created = await api<{ analysis: Analysis; uploads: Array<Omit<SignedUpload, "file">> }>("/api/analyses", {
        method: "POST",
        body: JSON.stringify({
          title: titleValue,
          topicCode: topicMode,
          ...(topicMode === "IT" && specializationId ? { specializationId } : {}),
          ...(text.trim() ? { text } : {}),
          quizEnabled,
          ...(prompt ? { customPrompt: prompt } : {}),
          files: files.map(file => ({ name: file.name, byteSize: file.size })),
        }),
      });
      setAnalysisId(created.analysis.id); setAnalysis(created.analysis);
      if (!created.analysis.user_id) rememberGuestAnalysis(created.analysis.id);
      const uploads: SignedUpload[] = created.uploads.map((upload, index) => ({ ...upload, file: files[index] })).filter(upload => Boolean(upload.file));
      if (uploads.length) {
        setPendingUploads(uploads);
        setPendingIngestId(created.analysis.id);
        setLoadingLabel("Đang tải tệp trực tiếp lên kho riêng tư...");
        await completeFileUploadAndReview(created.analysis.id, uploads);
      } else {
        await refreshReview(created.analysis.id);
        setFiles([]); setText("");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo phiên phân tích."); }
    finally { setBusy(false); setLoadingLabel(""); }
  }

  async function saveReview() {
    if (!analysisId) return;
    setBusy(true); setError(""); setToast(""); setLoadingLabel("Đang lưu nội dung đã chỉnh sửa và cập nhật cấu trúc...");
    try {
      const custom = [`Mức phân tích: ${depth === "quick" ? "nhanh" : depth === "deep" ? "chuyên sâu" : "tiêu chuẩn"}.`, selectedSpecialization ? `Chuyên ngành IT đã chọn: ${selectedSpecialization.name}.` : "", customPrompt.trim()].filter(Boolean).join(" ");
      await api(`/api/analyses/${analysisId}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim() || analysis?.title || "Phân tích mới",
          topicCode: topicMode,
          specializationId: topicMode === "IT" ? specializationId || null : null,
          customPrompt: custom || null,
          quizEnabled,
          inputs: inputRows.map(input => ({ id: input.id, editedText: inputTexts[input.id] ?? "" })),
        }),
      });
      await refreshReview(analysisId);
      setToast("Đã lưu nội dung và cập nhật cấu trúc tài liệu.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu nội dung."); }
    finally { setBusy(false); setLoadingLabel(""); }
  }

  async function confirmAndRun() {
    if (!analysisId) return;
    setBusy(true); setError(""); setToast(""); setScreen("processing");
    const retrying = ["failed", "processing"].includes(analysis?.status ?? "") && Boolean(analysis?.confirmed_at);
    setLoadingLabel(retrying ? "Đang thử xử lý lại phiên đã xác nhận..." : "Đang xác nhận tài liệu...");
    try {
      if (!retrying) await api(`/api/analyses/${analysisId}/confirm`, { method: "POST" });
      setLoadingLabel("AI đang phân tích từng phần tài liệu...");
      let completed: { status: "processing" | "completed"; completedChunks?: number; totalChunks?: number; waitMs?: number; result?: ResultJson };
      do {
        completed = await api<typeof completed>(`/api/analyses/${analysisId}/run`, { method: "POST" });
        if (completed.status === "processing") {
          setAnalysis(current => current ? { ...current, status: "processing" } : current);
          setLoadingLabel(`Đã xử lý ${completed.completedChunks ?? 0}/${completed.totalChunks ?? "?"} phần · đang tiếp tục...`);
          if (completed.waitMs) await new Promise(resolve => setTimeout(resolve, completed.waitMs));
        }
      } while (completed.status === "processing");
      await loadResult(analysisId, { ...(analysis ?? { id: analysisId, title, status: "completed" }), status: "completed" });
      setToast("Phân tích đã hoàn tất. Kết quả được lưu trong workspace của phiên này.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quá trình phân tích bị gián đoạn.");
      setScreen("review");
      if (analysisId) {
        try {
          const details = await api<{ analysis: Analysis }>(`/api/analyses/${analysisId}`);
          setAnalysis(details.analysis);
        } catch { /* show original processing error */ }
      }
    } finally { setBusy(false); setLoadingLabel(""); }
  }

  async function openHistoryItem(item: HistoryRow) {
    setBusy(true); setError(""); setAnalysisId(item.id); setTitle(item.title);
    try {
      const details = await api<{ analysis: Analysis; inputs: ApiInput[]; result: { id: string; result_json: ResultJson } | null }>(`/api/analyses/${item.id}?includeContent=true`);
      setAnalysis(details.analysis); setInputRows(details.inputs);
      setInputTexts(Object.fromEntries(details.inputs.map(input => [input.id, input.edited_text ?? input.normalized_text ?? input.original_text ?? ""])));
      setReport(details.analysis.validation_report ?? null);
      if (item.status === "completed") await loadResult(item.id, details.analysis);
      else if (["draft", "needs_review"].includes(item.status)) {
        if (details.analysis.validation_report?.inputs?.length) setOutline(details.analysis.validation_report.inputs.flatMap(input => input.structure));
        setScreen("review");
      } else if (item.status === "failed") {
        setScreen("processing");
        setLoadingLabel("Phiên đã xác nhận nhưng bị gián đoạn. Bạn có thể thử xử lý lại.");
      } else {
        setScreen("processing");
        setLoadingLabel(item.status === "processing" ? "Phiên đang xử lý dở. Tiếp tục để hoàn thành các phần còn lại." : statusLabel(item.status));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không mở được phiên phân tích."); }
    finally { setBusy(false); }
  }

  async function submitQuiz() {
    if (!analysisId) return;
    setBusy(true); setError("");
    try {
      const response = await api<{ attempt: { score: number; total_questions: number }; correctAnswers: number; feedback: QuizFeedback[] }>(`/api/analyses/${analysisId}/quiz/attempts`, { method: "POST", body: JSON.stringify({ answers: quizAnswers }) });
      setQuizScore({ correctAnswers: response.correctAnswers, attempt: response.attempt }); setQuizFeedback(response.feedback);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không gửi được bài quiz."); }
    finally { setBusy(false); }
  }

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatInput.trim();
    if (!analysisId || !message) return;
    setChat(current => [...current, { role: "user", content: message }]); setChatInput(""); setBusy(true); setError("");
    try {
      const response = await api<{ assistantMessage: ChatMessage }>(`/api/analyses/${analysisId}/chat`, { method: "POST", body: JSON.stringify({ message }) });
      setChat(current => [...current, response.assistantMessage]);
    } catch (cause) {
      setChat(current => current.slice(0, -1)); setChatInput(message);
      setError(cause instanceof Error ? cause.message : "Không gửi được câu hỏi.");
    } finally { setBusy(false); }
  }

  async function reloadQuiz() {
    if (!analysisId) return;
    setBusy(true); setQuizLoadError("");
    try {
      const response = await api<{ quiz: { id: string }; questions: QuizQuestion[] }>(`/api/analyses/${analysisId}/quiz`, { method: "POST" });
      setQuizQuestions(response.questions ?? []);
      if (!response.questions?.length) setQuizLoadError("Quiz chưa có câu hỏi. Hãy chạy lại phân tích sau khi hệ thống cập nhật.");
    } catch (cause) { setQuizLoadError(cause instanceof Error ? cause.message : "Không tải được quiz."); }
    finally { setBusy(false); }
  }

  async function reloadChat() {
    if (!analysisId) return;
    setBusy(true); setChatLoadError("");
    try {
      const response = await api<{ messages: ChatMessage[] }>(`/api/analyses/${analysisId}/chat`);
      setChat(response.messages ?? []);
    } catch (cause) { setChatLoadError(cause instanceof Error ? cause.message : "Không tải được chatbot."); }
    finally { setBusy(false); }
  }

  function renderChatPanel(className = "panel chat-panel") {
    return <section className={className}>
      <div className="chat-heading"><span className="chat-spark">✦</span><div><h3>Hỏi đáp cùng AI</h3><small>Dựa trên tài liệu đã phân tích</small></div><button title="Tải lại hội thoại" onClick={() => void reloadChat()}>↻</button></div>
      {chatLoadError && <div className="inline-error" role="alert">{chatLoadError}<button onClick={() => void reloadChat()}>Thử lại</button></div>}
      <div className="chat-messages">{chat.length === 0 ? <div className="chat-welcome"><span className="ai-avatar">✦</span><p>Chào bạn! Mình đã đọc tài liệu này. Bạn có thể hỏi về bất kỳ phần nào trong nội dung.</p><button onClick={() => setChatInput("Tóm tắt những ý quan trọng nhất trong tài liệu")}>Tóm tắt ý quan trọng nhất <span>↗</span></button><button onClick={() => setChatInput("Giải thích thuật ngữ quan trọng nhất trong tài liệu")}>Giải thích thuật ngữ quan trọng <span>↗</span></button></div> : chat.map((message, index) => <div className={`chat-message ${message.role}`} key={message.id ?? index}><div className="chat-role">{message.role === "user" ? "Bạn" : "AI · Dựa trên tài liệu"}</div><p>{message.content}</p>{message.citations?.length ? <small>Nguồn: {message.citations.join(", ")}</small> : null}</div>)}</div>
      <form className="chat-form" onSubmit={event => void sendChat(event)}><textarea value={chatInput} onChange={event => setChatInput(event.target.value)} maxLength={4000} rows={2} placeholder="Hỏi tiếp về tài liệu..." /><button type="submit" disabled={busy || !chatInput.trim()} aria-label="Gửi câu hỏi">↑</button></form>
      <div className="chat-disclaimer">AI có thể sai. Hãy kiểm tra nội dung với tài liệu gốc.</div>
    </section>;
  }

  async function exportResult(format: "pdf" | "docx" | "markdown" | "html" | "json") {
    if (!analysisId) return;
    setBusy(true); setError("");
    try {
      if (["pdf", "docx", "html"].includes(format) && resultId && result) {
        const diagrams = Array.from(new Set(result.sections.flatMap(section => section.blocks)
          .filter(block => block.contentType === "mermaid" || block.type === "mermaid" || (block.type === "diagram" && !block.contentType && typeof block.content === "string" && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey)\b/.test(block.content.trim())))
          .map(block => typeof block.content === "string" ? block.content.trim() : "").filter(Boolean)));
        if (diagrams.length) {
          setLoadingLabel("Đang chuẩn bị ảnh sơ đồ cho báo cáo...");
          const { default: mermaid } = await import("mermaid");
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
          for (const [index, source] of diagrams.entries()) {
            try {
              const { svg } = await mermaid.render(`export-diagram-${Date.now()}-${index}`, source);
              await api(`/api/analyses/${analysisId}/assets`, {
                method: "POST", body: JSON.stringify({ resultId, assetType: "mermaid", source, svg, title: "Sơ đồ báo cáo" }),
              });
            } catch {
              throw new Error("Không dựng hoặc lưu được sơ đồ cho báo cáo. Hãy kiểm tra mã Mermaid trong phần Chi tiết rồi thử lại.");
            }
          }
        }
      }
      setLoadingLabel("Đang tạo tệp báo cáo...");
      const response = await api<{ downloadUrl: string }>(`/api/analyses/${analysisId}/exports`, { method: "POST", body: JSON.stringify({ format }) });
      window.location.assign(response.downloadUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không xuất được tài liệu."); }
    finally { setBusy(false); setLoadingLabel(""); }
  }

  function addFiles(accepted: File[]) {
    const tooLarge = accepted.filter(file => file.size > 20 * 1024 * 1024);
    const valid = accepted.filter(file => file.size <= 20 * 1024 * 1024);
    if (tooLarge.length) setError(`Tệp “${tooLarge[0].name}” vượt giới hạn 20 MB.`);
    else if (files.length + valid.length > 10) setError("Mỗi phân tích chỉ nhận tối đa 10 tệp. Hãy bỏ bớt tệp rồi thử lại.");
    else setError("");
    setFiles(current => [...current, ...valid].slice(0, 10));
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  const stepIndex = screen === "input" ? 0 : screen === "review" ? 1 : screen === "processing" ? 2 : 3;
  const resultHeadings: Record<string, string> = { overview: "Tổng quan tài liệu", summary: "Tóm tắt tài liệu", detail: "Phân tích chi tiết", conclusion: "Kết luận tổng hợp", quiz: "Quiz ôn tập", chat: "Hỏi đáp cùng AI", report: "Xuất báo cáo" };
  const heading = screen === "input" ? "Biến tài liệu thành tri thức" : screen === "review" ? "Kiểm tra tài liệu trước khi xử lý" : screen === "processing" ? "Đang xây dựng workspace học tập" : screen === "history" ? "Lịch sử phân tích" : resultHeadings[activeResultTab] ?? resultHeadings.overview;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={event => { event.preventDefault(); setScreen("input"); setError(""); }}>
          <span className="brand-mark">D</span><span>DocuMind</span>
        </a>
        <div className="side-label">KHÔNG GIAN LÀM VIỆC</div>
        <nav className="side-nav" aria-label="Điều hướng chính">
          <button className={`nav-item ${screen !== "history" && screen !== "result" ? "active" : ""}`} onClick={() => { setScreen("input"); setError(""); }}><Icon>＋</Icon>Phân tích mới</button>
          {screen === "result" && <div className="nav-submenu">
            <button className={activeResultTab === "overview" ? "selected" : ""} onClick={() => setActiveResultTab("overview")}>Tổng quan</button>
            <button className={activeResultTab === "summary" ? "selected" : ""} onClick={() => setActiveResultTab("summary")}>Tóm tắt</button>
            <button className={activeResultTab === "detail" ? "selected" : ""} onClick={() => setActiveResultTab("detail")}>Phân tích chi tiết</button>
            <button className={activeResultTab === "conclusion" ? "selected" : ""} onClick={() => setActiveResultTab("conclusion")}>Kết luận</button>
            {analysis?.quiz_enabled && <button className={activeResultTab === "quiz" ? "selected" : ""} onClick={() => setActiveResultTab("quiz")}>Quiz {quizQuestions.length > 0 ? `(${quizQuestions.length})` : ""}</button>}
            <button className={activeResultTab === "chat" ? "selected" : ""} onClick={() => setActiveResultTab("chat")}>Hỏi đáp AI</button>
            <button className={activeResultTab === "report" ? "selected" : ""} onClick={() => setActiveResultTab("report")}>Xuất báo cáo</button>
          </div>}
          <button className={`nav-item ${screen === "history" ? "active" : ""}`} onClick={() => void loadHistory()}><Icon>▦</Icon>Lịch sử <span className="nav-count">{history.length || ""}</span></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><div className="tip-icon">✦</div><strong>Tài liệu của bạn</strong><p>được lưu theo từng phiên để tiếp tục học bất cứ lúc nào.</p><button onClick={() => void loadHistory()}>Xem lịch sử <span>→</span></button></div>
        <button type="button" className="profile-row" onClick={() => setAuthMode(authUser ? "profile" : "sign-in")} aria-label={authUser ? "Mở hồ sơ tài khoản" : "Đăng nhập hoặc đăng ký"}>
          <div className="avatar">{authUser ? accountInitial : "DM"}</div><div><strong>{authUser ? accountName : "Đang dùng với tư cách khách"}</strong><small>{authUser ? authUser.email : "Đăng nhập để lưu lịch sử"}</small></div><span className="profile-dots">{authUser ? "⌄" : "↗"}</span>
        </button>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>DocuMind</span><b>/</b><strong>{screen === "result" ? analysis?.title ?? "Workspace" : screen === "review" ? "Kiểm tra đầu vào" : screen === "history" ? "Lịch sử" : "Phân tích mới"}</strong></div>
          <div className="top-actions"><span className="save-state"><i />{screen === "result" ? "Đã lưu thay đổi" : "Mọi thay đổi được lưu theo phiên"}</span>
            {authUser ? <><button type="button" className="auth-account-button" onClick={() => setAuthMode("profile")} title="Hồ sơ tài khoản"><span className="auth-avatar">{accountInitial}</span><span className="auth-account-name">{accountName}</span></button><button type="button" className="auth-logout-button" onClick={() => void signOutFromHeader()}>Đăng xuất</button></> : <><button type="button" className="auth-login-button" onClick={() => setAuthMode("sign-in")} disabled={!authReady}>Đăng nhập</button><button type="button" className="auth-signup-button" onClick={() => setAuthMode("sign-up")} disabled={!authReady}>Tạo tài khoản</button></>}
            <button className="help-button" title="Trợ giúp" onClick={() => setToast("Luồng gồm nhập tài liệu, kiểm tra, xác nhận xử lý và xem kết quả.")}>?</button></div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><div className="eyebrow"><span className="eyebrow-star">✦</span> TRỢ LÝ HỌC TẬP AI</div><h1>{heading}</h1><p>{screen === "input" ? "Tải lên tài liệu hoặc dán nội dung. DocuMind sẽ giúp bạn hiểu sâu và ôn tập hiệu quả hơn." : screen === "review" ? "Xem nội dung đã trích xuất, chỉnh sửa nếu cần rồi xác nhận trước khi AI xử lý." : screen === "history" ? "Mở lại tài liệu, kết quả hoặc phiên xử lý đang dang dở." : screen === "result" ? "Các ý chính, phân tích và công cụ học tập từ tài liệu của bạn." : "Tài liệu đã xác nhận. DocuMind đang phân tích theo từng phần."}</p></div>
            {screen === "result" && <div className="header-export"><button className="button button-secondary" disabled={busy} onClick={() => setActiveResultTab("report")}><Icon>↓</Icon> Xuất báo cáo</button></div>}
          </div>

          {screen !== "history" && <div className="stepper" aria-label="Tiến độ phân tích">{steps.map((label, index) => <div className={`step ${index < stepIndex ? "done" : ""} ${index === stepIndex ? "current" : ""}`} key={label}><span className="step-number">{index < stepIndex ? "✓" : `0${index + 1}`}</span><span className="step-name">{label}</span>{index < steps.length - 1 && <i className="step-line" />}</div>)}</div>}

          {screen === "result" && <nav className="result-tabs" aria-label="Các trang kết quả">
            {[{ id: "overview", label: "Tổng quan" }, { id: "summary", label: "Tóm tắt" }, { id: "detail", label: "Chi tiết" }, { id: "conclusion", label: "Kết luận" }, ...(analysis?.quiz_enabled ? [{ id: "quiz", label: `Quiz${quizQuestions.length ? ` (${quizQuestions.length})` : ""}` }] : []), { id: "chat", label: "Hỏi đáp AI" }, { id: "report", label: "Xuất báo cáo" }].map(tab => <button type="button" key={tab.id} className={activeResultTab === tab.id ? "active" : ""} aria-current={activeResultTab === tab.id ? "page" : undefined} onClick={() => setActiveResultTab(tab.id)}>{tab.label}</button>)}
          </nav>}

          {error && <div className="alert alert-error" role="alert"><span>!</span><div><strong>Chưa thể hoàn tất bước này</strong><p>{error}</p></div>{(pendingUploads.length > 0 || pendingIngestId) && <button className="button button-secondary" disabled={busy} onClick={() => void retryIncompleteUpload()}>Tiếp tục tải tệp</button>}<button onClick={() => setError("")} aria-label="Đóng">×</button></div>}
          {toast && <div className="alert alert-success" role="status"><span>✓</span><div>{toast}</div><button onClick={() => setToast("")} aria-label="Đóng">×</button></div>}

          {screen === "input" && <form className="input-layout" onSubmit={createAnalysis}>
            <section className="panel input-panel">
              <div className="panel-heading"><div><div className="panel-kicker">BẮT ĐẦU PHIÊN MỚI</div><h2>Thiết lập phân tích</h2><p>Chọn chủ đề và cho AI biết bạn muốn học điều gì.</p></div><span className="panel-index">01</span></div>
              <div className="form-grid">
                <label className="field"><span>Chủ đề tài liệu</span><select value={topicMode} onChange={event => { setTopicMode(event.target.value); setSpecializationId(""); }}><option value="AUTO">Tự nhận diện chủ đề</option><option value="IT">Công nghệ thông tin</option><option value="GENERAL">Chủ đề chung</option></select><small>{topicMode === "IT" ? "Ưu tiên prompt kỹ thuật theo chuyên ngành IT." : "Ngoài IT hoặc chưa rõ chủ đề sẽ dùng prompt chung."}</small></label>
                <label className="field"><span>Ngôn ngữ đầu ra</span><select value="vi" disabled><option value="vi">Tiếng Việt</option></select><small>Kết quả được tạo bằng tiếng Việt.</small></label>
                {topicMode === "IT" && <label className="field field-wide"><span>Chuyên ngành IT <em>Không bắt buộc</em></span><select value={specializationId} onChange={event => setSpecializationId(event.target.value)}><option value="">Tự nhận diện chuyên ngành</option>{selectedTopic?.specializations.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><small>Nếu không chọn, hệ thống sẽ nhận diện từ nội dung tài liệu.</small></label>}
                <label className="field field-wide"><span>Tên phiên phân tích <em>Không bắt buộc</em></span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Ví dụ: Lập trình hướng đối tượng với Java" /></label>
                <label className="field field-wide"><span>Yêu cầu AI <em>Không bắt buộc</em></span><textarea value={customPrompt} onChange={event => setCustomPrompt(event.target.value)} maxLength={3000} rows={3} placeholder="Bạn muốn AI tập trung giải thích phần nào? Ví dụ: làm rõ luồng xử lý, thuật ngữ và ví dụ trong tài liệu..." /><small>{customPrompt.length}/3000 ký tự · AI luôn bám sát nội dung nguồn.</small></label>
              </div>
              <div className="field-heading"><div><span>Mức phân tích</span><small>Chọn độ chi tiết của phần giải thích.</small></div></div>
              <div className="depth-selector" role="radiogroup" aria-label="Mức phân tích">
                {[{ id: "quick", title: "Nhanh", sub: "Nắm ý chính", icon: "◷" }, { id: "standard", title: "Tiêu chuẩn", sub: "Cân bằng nội dung", icon: "◈" }, { id: "deep", title: "Chuyên sâu", sub: "Giải thích kỹ hơn", icon: "✦" }].map(item => <button type="button" key={item.id} className={`depth-option ${depth === item.id ? "chosen" : ""}`} role="radio" aria-checked={depth === item.id} onClick={() => setDepth(item.id)}><span className="depth-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.sub}</small></span><i className="radio-mark" /></button>)}
              </div>
              <label className={`quiz-toggle ${quizEnabled ? "enabled" : ""}`}><span className="quiz-toggle-icon">✧</span><span><strong>Tạo quiz ôn tập</strong><small>Thêm câu hỏi trắc nghiệm dựa trên tài liệu.</small></span><input type="checkbox" checked={quizEnabled} onChange={event => setQuizEnabled(event.target.checked)} /><i className="switch" /></label>
            </section>

            <section className="panel source-panel">
              <div className="panel-heading"><div><div className="panel-kicker">NỘI DUNG ĐẦU VÀO</div><h2>Tài liệu của bạn</h2><p>Tải tệp hoặc dán nội dung để bắt đầu.</p></div><span className="panel-index">02</span></div>
              <label className={`dropzone ${files.length ? "has-files" : ""} ${isDraggingFiles ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setIsDraggingFiles(true); }} onDragLeave={() => setIsDraggingFiles(false)} onDrop={event => { event.preventDefault(); setIsDraggingFiles(false); addFiles(Array.from(event.dataTransfer.files)); }}>
                <input type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.json,.js,.jsx,.ts,.tsx,.py,.java,.sql,.html,.css,.xml,.yaml,.yml,.sh,.go,.rs,.c,.cpp,.h,.png,.jpg,.jpeg" onChange={onFileChange} />
                <span className="upload-icon"><Icon>↑</Icon></span><strong>Kéo thả tệp vào đây</strong><span>hoặc <b>chọn từ thiết bị</b></span><small>PDF, DOCX, TXT, Markdown, mã nguồn, PNG/JPG · Tối đa 10 tệp, 20 MB mỗi tệp</small>
              </label>
              {files.length > 0 && <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${index}`}><span className="file-type">{file.name.split(".").pop()?.toUpperCase().slice(0, 4)}</span><div className="file-meta"><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(0)} KB</small></div><button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Xóa ${file.name}`}>×</button></div>)}</div>}
              <div className="or-divider"><span>HOẶC DÁN NỘI DUNG</span></div>
              <label className="field pasted-field"><span>Nội dung văn bản</span><textarea value={text} onChange={event => setText(event.target.value)} rows={7} maxLength={500000} placeholder="Dán nội dung tài liệu, ghi chú hoặc code vào đây..." /><small>{text.length.toLocaleString("vi-VN")} ký tự · Bạn có thể kết hợp văn bản và tệp.</small></label>
              <div className="privacy-note"><Icon>◉</Icon><span>Tài liệu riêng tư, chỉ bạn truy cập được. AI chỉ xử lý sau khi bạn kiểm tra và xác nhận.</span></div>
              <button className="button button-primary button-full" disabled={busy || (!text.trim() && files.length === 0)} type="submit">{busy ? <><span className="spinner" />{loadingLabel || "Đang chuẩn bị..."}</> : <>Kiểm tra tài liệu <span>→</span></>}</button>
              <p className="button-footnote">Bước tiếp theo cho phép bạn xem và chỉnh sửa nội dung đã trích xuất.</p>
            </section>
          </form>}

          {screen === "review" && <div className="review-layout">
            <section className="panel review-main">
              <div className="panel-heading"><div><div className="panel-kicker">BƯỚC 02 · KIỂM TRA ĐẦU VÀO</div><h2>{analysis?.title || title || "Tài liệu mới"}</h2><p>Rà soát nội dung trích xuất và cấu trúc trước khi gửi AI.</p></div><span className={`status-pill ${report?.valid ? "status-ok" : "status-warn"}`}>{report?.valid ? "Đã kiểm tra" : "Cần chỉnh sửa"}</span></div>
              <div className="review-stats"><div><strong>{report?.inputCount ?? inputRows.length}</strong><span>Tệp đầu vào</span></div><div><strong>{(report?.totalWords ?? 0).toLocaleString("vi-VN")}</strong><span>Từ</span></div><div><strong>{report?.chunkCount ?? allOutline.length}</strong><span>Phần xử lý</span></div></div>
              {(report?.blockingErrors ?? []).map((item, i) => <div className="validation-message validation-error" key={`e-${i}`}><b>!</b><span>{item.message}</span></div>)}
              {(report?.warnings ?? []).map((item, i) => <div className="validation-message validation-warning" key={`w-${i}`}><b>i</b><span>{item.message}</span></div>)}
              {(report?.notes ?? []).map((item, i) => <div className="validation-message validation-note" key={`n-${i}`}><b>✓</b><span>{item.message}</span></div>)}
              <div className="review-section-title"><div><h3>Nội dung đã trích xuất</h3><p>Chỉnh sửa nếu nội dung thiếu hoặc chưa chính xác.</p></div><span className="editable-label">Có thể chỉnh sửa</span></div>
              {inputRows.map(input => <div className="field extracted-field" key={input.id}><span><Icon>▤</Icon>{input.original_name || "Tài liệu"}<small>{(inputTexts[input.id] ?? "").length.toLocaleString("vi-VN")} ký tự</small></span>{input.previewUrl && <img className="source-image-preview" src={input.previewUrl} alt={`Ảnh gốc: ${input.original_name || "tài liệu"}`} />}{input.metadata?.extraction === "gemini_vision" || input.metadata?.extraction === "gemini_vision_pdf_ocr" || input.metadata?.extraction === "docx_text_and_gemini_vision" ? <small className="extraction-hint">Đã đọc chữ và nhận diện công thức/sơ đồ bằng AI. Hãy kiểm tra lại nội dung bên dưới.</small> : null}<textarea aria-label={`Nội dung trích xuất: ${input.original_name || "tài liệu"}`} value={inputTexts[input.id] ?? ""} onChange={event => setInputTexts(current => ({ ...current, [input.id]: event.target.value }))} rows={Math.min(18, Math.max(7, Math.ceil((inputTexts[input.id] ?? "").length / 115)))} maxLength={500000} /></div>)}
              <div className="review-section-title outline-heading"><div><h3>Cấu trúc được đề xuất</h3><p>AI sẽ xử lý tài liệu theo từng phần để giữ ngữ cảnh.</p></div></div>
              <div className="outline-list">{allOutline.map((item, index) => <div className="outline-item" key={`${item.chunkIndex}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title || `Phần ${index + 1}`}</strong><small>{item.preview}</small></div><Icon>⌄</Icon></div>)}{allOutline.length === 0 && <div className="empty-inline">Lưu nội dung chỉnh sửa để cập nhật cấu trúc tài liệu.</div>}</div>
              <div className="review-actions"><button className="button button-quiet" disabled={busy} onClick={() => { setScreen("input"); setError(""); }}>← Quay lại</button><div><button className="button button-secondary" disabled={busy} onClick={() => void saveReview()}>{busy ? "Đang lưu..." : "Lưu chỉnh sửa"}</button><button className="button button-primary" disabled={busy || !analysisId} onClick={() => void confirmAndRun()}>{busy ? "Đang xử lý..." : <>Xác nhận và xử lý <span>→</span></>}</button></div></div>
            </section>
            <aside className="review-side">
              <div className="panel side-summary"><div className="panel-kicker">TÓM TẮT PHIÊN</div><h3>{title || files[0]?.name || "Tài liệu học tập"}</h3><div className="summary-meta"><span>Chủ đề</span><strong>{topicMode === "IT" ? "Công nghệ thông tin" : topicMode === "GENERAL" ? "Chủ đề chung" : "Tự nhận diện"}</strong></div><div className="summary-meta"><span>Mức phân tích</span><strong>{depth === "quick" ? "Nhanh" : depth === "deep" ? "Chuyên sâu" : "Tiêu chuẩn"}</strong></div><div className="summary-meta"><span>Quiz ôn tập</span><strong>{quizEnabled ? "Có" : "Không"}</strong></div><div className="summary-divider" /><p><Icon>✦</Icon> Bạn có thể chỉnh sửa nội dung trích xuất trước khi xác nhận.</p></div>
              <div className="panel review-assurance"><span className="assurance-icon">✓</span><div><strong>Chưa gửi đến AI</strong><p>Tài liệu chỉ được xử lý sau khi bạn nhấn “Xác nhận và xử lý”.</p></div></div>
            </aside>
          </div>}

          {screen === "processing" && <div className="processing-wrap"><div className="panel processing-card"><div className="processing-illustration"><span className="orbit orbit-a" /><span className="orbit orbit-b" /><span className="processing-core">✦</span><span className="spark spark-a">✧</span><span className="spark spark-b">✦</span></div><div className="panel-kicker">DOCUMIND ĐANG LÀM VIỆC</div><h2>{loadingLabel || "Đang xử lý phiên của bạn"}</h2><p>{analysis?.title || title || "Tài liệu học tập"}</p><div className="processing-progress"><i /></div><div className="processing-status"><span><i />Đang phân tích nội dung</span><small>Bạn có thể mở lại phiên từ Lịch sử để tiếp tục.</small></div><div className="processing-points"><span>✓ Tài liệu đã được xác nhận</span><span>✦ Kết quả sẽ được lưu vào workspace</span></div>{["failed", "processing"].includes(analysis?.status ?? "") && !busy && <button className="button button-primary" onClick={() => void confirmAndRun()}>{analysis?.status === "failed" ? "Thử xử lý lại" : "Tiếp tục xử lý"} <span>→</span></button>}</div></div>}

          {screen === "history" && <section className="history-list panel"><div className="panel-heading"><div><div className="panel-kicker">WORKSPACE CÁ NHÂN</div><h2>Các phiên gần đây</h2><p>Mở lại phiên để xem kết quả hoặc tiếp tục chỉnh sửa.</p></div><button className="button button-primary" onClick={() => setScreen("input")}>＋ Phân tích mới</button></div>{history.length === 0 ? <div className="empty-state"><span>▤</span><h3>Chưa có phiên phân tích</h3><p>Tài liệu bạn xử lý sẽ được lưu tại đây.</p><button className="button button-primary" onClick={() => setScreen("input")}>Bắt đầu phân tích <span>→</span></button></div> : history.map(item => <button className="history-row" key={item.id} onClick={() => void openHistoryItem(item)}><span className={`history-file ${item.status === "completed" ? "complete" : ""}`}>{item.status === "completed" ? "✓" : "▤"}</span><span className="history-main"><strong>{item.title}</strong><small>{item.quiz_enabled ? "Có quiz" : "Không có quiz"} · {formatDate(item.updated_at || item.created_at)}</small></span><span className={`status-pill ${item.status === "completed" ? "status-ok" : item.status === "failed" ? "status-error" : "status-warn"}`}>{statusLabel(item.status)}</span><span className="history-open">Mở phiên →</span></button>)}</section>}

          {screen === "result" && result && <div className={`results-layout ${["chat", "report"].includes(activeResultTab) ? "single-result" : ""}`}>
            <div className="result-column">
              <div className="result-meta-line"><span className="status-pill status-ok">✓ Hoàn thành</span><span>{analysis?.title || result.title || "Tài liệu"}</span><span className="meta-dot">·</span><span>{(report?.totalWords ?? 0).toLocaleString("vi-VN")} từ</span><span className="meta-dot">·</span><span>{(result.sections ?? []).length} mục</span></div>
              {activeResultTab === "overview" && <>
                <div className="metric-grid"><div className="metric-card"><span className="metric-icon violet">✦</span><small>PHẦN PHÂN TÍCH</small><strong>{result.sections?.length ?? 0}</strong><span>mục nội dung</span></div><div className="metric-card"><span className="metric-icon blue">▤</span><small>ĐỘ DÀI TÀI LIỆU</small><strong>{(report?.totalWords ?? 0).toLocaleString("vi-VN")}</strong><span>từ được xử lý</span></div><div className="metric-card"><span className="metric-icon green">✓</span><small>TRẠNG THÁI</small><strong className="metric-word">Hoàn thành</strong><span>{formatDate(analysis?.completed_at)}</span></div></div>
                <article className="panel key-takeaways"><div className="result-section-head"><div><div className="panel-kicker">ĐIỀU BẠN CẦN BIẾT</div><h2>Tóm tắt tài liệu</h2></div><button className="text-button" onClick={() => setActiveResultTab("summary")}>Đọc đầy đủ →</button></div><p className="summary-copy">{resultSummary}</p><div className="takeaway-list">{result.sections.slice(0, 3).map((section, index) => <div key={`${section.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{section.title}</strong><p>{section.summary || (section.blocks?.[0] ? blockToPlainText(section.blocks[0]).slice(0, 180) : "")}</p></div></div>)}</div></article>
                <div className="result-shortcuts"><button onClick={() => setActiveResultTab("detail")}><span>☷</span><strong>Đọc phân tích chi tiết</strong><i>→</i></button><button onClick={() => setActiveResultTab("conclusion")}><span>✓</span><strong>Xem kết luận</strong><i>→</i></button>{analysis?.quiz_enabled && <button onClick={() => setActiveResultTab("quiz")}><span>✧</span><strong>{quizQuestions.length ? `Làm quiz (${quizQuestions.length} câu)` : "Mở quiz ôn tập"}</strong><i>→</i></button>}<button onClick={() => setActiveResultTab("chat")}><span>✦</span><strong>Hỏi tiếp về tài liệu</strong><i>→</i></button><button onClick={() => setActiveResultTab("report")}><span>↓</span><strong>Tải báo cáo</strong><i>→</i></button></div>
              </>}

              {activeResultTab === "summary" && <article className="panel result-article"><div className="panel-kicker">TÓM TẮT TÀI LIỆU</div><h2>{result.title || analysis?.title || "Tóm tắt"}</h2><p className="summary-copy">{resultSummary}</p>{result.sections.map((section, index) => <section className="article-section" key={`${section.title}-${index}`}><h3>{section.title}</h3>{section.summary && <p>{section.summary}</p>}{section.blocks.slice(0, 2).map((block, bi) => <ResultBlockView block={block} analysisId={analysisId ?? undefined} resultId={resultId ?? undefined} key={`${block.type}-${bi}`} />)}</section>)}</article>}

              {activeResultTab === "detail" && <div className="detail-sections">{result.sections.map((section, index) => <article className="panel detail-section" key={`${section.title}-${index}`}><div className="detail-title"><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{section.title}</h2>{section.summary && <p>{section.summary}</p>}</div></div>{section.blocks.map((block, blockIndex) => <ResultBlockView block={block} analysisId={analysisId ?? undefined} resultId={resultId ?? undefined} key={`${block.type}-${blockIndex}`} />)}</article>)}</div>}

              {activeResultTab === "conclusion" && <article className="panel conclusion-panel"><div className="conclusion-heading"><span className="conclusion-mark">✓</span><div><div className="panel-kicker">KẾT LUẬN TỔNG HỢP</div><h2>{result.title || analysis?.title || "Điều rút ra từ tài liệu"}</h2></div></div><p className="conclusion-copy">{resultConclusion}</p><div className="conclusion-highlights"><h3>Các điểm đã được phân tích</h3>{result.sections.map((section, index) => <div className="conclusion-highlight" key={`${section.title}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{section.title}</strong><p>{section.summary || (section.blocks[0] ? blockToPlainText(section.blocks[0]).slice(0, 220) : "")}</p></div></div>)}</div><div className="conclusion-actions"><button className="button button-secondary" onClick={() => setActiveResultTab("detail")}>Quay lại phân tích chi tiết</button>{analysis?.quiz_enabled && <button className="button button-primary" onClick={() => setActiveResultTab("quiz")}>Ôn tập với quiz →</button>}</div></article>}

              {activeResultTab === "quiz" && <article className="panel quiz-panel"><div className="panel-kicker">ÔN TẬP TƯƠNG TÁC</div><h2>Kiểm tra kiến thức</h2><p>Chọn một đáp án cho mỗi câu hỏi. Đáp án sẽ được kiểm tra dựa trên tài liệu.</p>{quizLoadError && <div className="inline-error" role="alert">{quizLoadError}<button onClick={() => void reloadQuiz()}>Tạo hoặc tải lại quiz</button></div>}{quizQuestions.length === 0 ? (analysis?.quiz_enabled ? <div className="empty-state compact-empty"><h3>Quiz chưa sẵn sàng</h3><p>Hệ thống sẽ tạo quiz từ những phần tài liệu đã lưu.</p><button className="button button-secondary" disabled={busy} onClick={() => void reloadQuiz()}>Tạo lại quiz</button></div> : <div className="empty-inline">Phiên này không yêu cầu tạo quiz.</div>) : <>{quizQuestions.map((question, index) => { const feedback = quizFeedback?.find(item => item.questionId === question.id); return <div className="quiz-question" key={question.id}><div className="quiz-q-meta"><span>CÂU {String(index + 1).padStart(2, "0")}</span><small>{question.difficulty === "easy" ? "Cơ bản" : question.difficulty === "hard" ? "Nâng cao" : "Trung bình"}</small></div><h3>{question.prompt}</h3><div className="quiz-options">{question.options.map((option, optionIndex) => <label key={optionIndex} className={`${quizAnswers[question.id] === optionIndex ? "selected" : ""} ${feedback && Number(feedback.answer) === optionIndex ? "right-answer" : ""} ${feedback && quizAnswers[question.id] === optionIndex && !feedback.correct ? "wrong-answer" : ""}`}><input type="radio" name={question.id} checked={quizAnswers[question.id] === optionIndex} disabled={Boolean(quizFeedback)} onChange={() => setQuizAnswers(current => ({ ...current, [question.id]: optionIndex }))} /><span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>{feedback && Number(feedback.answer) === optionIndex && <b>✓</b>}</label>)}</div>{feedback?.explanation && <p className={`quiz-explanation ${feedback.correct ? "" : "incorrect"}`}>{feedback.correct ? "Chính xác." : "Chưa chính xác."} {feedback.explanation}</p>}</div>; })}{quizScore && <div className="score-banner"><strong>{quizScore.correctAnswers}/{quizScore.attempt.total_questions} câu đúng</strong><span>Điểm {quizScore.attempt.score}%</span></div>}<div className="quiz-submit-row">{quizFeedback && <button className="button button-secondary" onClick={() => { setQuizFeedback(null); setQuizScore(null); setQuizAnswers({}); }}>Làm lại quiz</button>}<button className="button button-primary" disabled={busy || Boolean(quizFeedback) || Object.keys(quizAnswers).length !== quizQuestions.length} onClick={() => void submitQuiz()}>{busy ? "Đang kiểm tra..." : "Nộp bài quiz →"}</button></div></>}</article>}

              {activeResultTab === "chat" && renderChatPanel("panel chat-workspace")}

              {activeResultTab === "report" && <section className="panel report-workspace">
                <div className="panel-kicker">BÁO CÁO PHÂN TÍCH</div><h2>Xuất báo cáo</h2><p>Chọn định dạng tải xuống. Bản xem trước dưới đây là nội dung sẽ được đưa vào báo cáo.</p>
                <div className="report-format-grid">
                  {[{ id: "pdf", name: "PDF", detail: "Bản trình bày để đọc và chia sẻ" }, { id: "docx", name: "Word (.docx)", detail: "Có thể chỉnh sửa trong Microsoft Word" }, { id: "markdown", name: "Markdown (.md)", detail: "Tài liệu văn bản cho ghi chú và kỹ thuật" }, { id: "html", name: "HTML", detail: "Trang báo cáo có định dạng" }, { id: "json", name: "JSON", detail: "Dữ liệu có cấu trúc cho tích hợp kỹ thuật" }].map(format => <article className="report-format-card" key={format.id}><span className="report-format-icon">{format.id === "pdf" ? "PDF" : format.id === "docx" ? "W" : format.id === "json" ? "{}" : format.id.toUpperCase()}</span><div><strong>{format.name}</strong><p>{format.detail}</p></div><button className="button button-secondary" disabled={busy} onClick={() => void exportResult(format.id as "pdf" | "docx" | "markdown" | "html" | "json")}>{busy ? "Đang tạo..." : "Tải xuống"}</button></article>)}
                </div>
                <div className="report-preview"><div className="report-preview-head"><span className="panel-kicker">XEM TRƯỚC</span><span>{result.sections.length} mục · Tiếng Việt</span></div><h1>{result.title || analysis?.title || "Báo cáo học tập"}</h1><p>{resultSummary}</p>{result.sections.map((section, index) => <section key={`${section.title}-${index}`}><h3>{index + 1}. {section.title}</h3>{section.summary && <p>{section.summary}</p>}{section.blocks.map((block, blockIndex) => <ResultBlockView block={block} analysisId={analysisId ?? undefined} resultId={resultId ?? undefined} key={`${block.type}-${blockIndex}`} />)}</section>)}</div>
              </section>}

            </div>
            {!(["chat", "report"].includes(activeResultTab)) && <aside className="result-aside">
              <section className="panel topic-card"><div className="topic-card-top"><span>✦</span><small>CHỦ ĐỀ NHẬN DIỆN</small></div><h3>{String(result.metadata?.topicName ?? (analysis?.topic_id ? "Công nghệ thông tin" : "Chủ đề chung"))}</h3><p>{result.metadata?.promptScope === "general_fallback" ? "Dùng prompt chung · kết quả ít chuyên sâu hơn phân tích IT." : result.metadata?.promptScope === "it_specialized" ? "Đang dùng prompt chuyên sâu cho tài liệu IT." : "Phân tích bám sát tài liệu nguồn."}</p><div className="topic-badge">{result.metadata?.promptScope === "general_fallback" ? "Chủ đề chung" : result.metadata?.promptScope === "it_specialized" ? "Chuyên sâu IT" : "Đã phân tích"}</div></section>
              <section className="panel chat-quick"><div className="chat-heading"><span className="chat-spark">✦</span><div><h3>Hỏi đáp cùng AI</h3><small>Dựa trên tài liệu đã phân tích</small></div></div>{chatLoadError ? <div className="inline-error">{chatLoadError}<button onClick={() => void reloadChat()}>Thử lại</button></div> : <p>Đặt câu hỏi để làm rõ khái niệm hoặc tìm ý trong tài liệu.</p>}<button className="button button-secondary" onClick={() => setActiveResultTab("chat")}>Mở chatbot →</button></section>
            </aside>}
          </div>}

          {busy && loadingLabel && screen !== "processing" && <div className="busy-bar"><span className="spinner" />{loadingLabel}</div>}
        </div>
        <footer className="app-footer"><span>© 2026 DocuMind</span><span><i />Hệ thống học tập từ tài liệu</span><button onClick={() => setToast("Tài liệu chỉ được phân tích sau khi bạn xác nhận.")}>Quyền riêng tư</button></footer>
      </section>
      {authMode && <AuthDialog key={authMode} initialMode={authMode} email={authUser?.email ?? undefined} onClose={() => setAuthMode(null)} onAuthenticated={profile => { if (profile?.displayName) setAccountDisplayName(profile.displayName); setToast(authMode === "profile" ? "Hồ sơ đã cập nhật." : "Bạn đã đăng nhập vào DocuMind."); }} />}
    </main>
  );
}
