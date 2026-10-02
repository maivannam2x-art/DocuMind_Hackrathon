"use client";
import type { ValidationIssue } from "@/lib/validation-location";
import {
  workspaceFlow,
  recoveryScreen,
  type WorkspaceScreen,
  type FlowState,
  type FlowAction,
} from "@/lib/workspace-flow";
import { resumeState } from "@/lib/resume-state";
import { ingestBlocked } from "@/lib/ingest-state";
import type { Activity } from "@/lib/activity";
import { AppIcon } from "@/components/app-icon";
import { INPUT_LIMITS, FILE_ACCEPT, supportedFile } from "@/lib/limits";
import { quizSettings, type QuizSettings } from "@/lib/quiz-settings";
import { resumableLoop, RequestFailure } from "@/lib/resumable-loop";
import { renderMermaid } from "@/lib/mermaid-browser";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  useReducer,
} from "react";
import type { User } from "@supabase/supabase-js";

import {
  type QuizQuestion,
  type QuizSubmission,
} from "@/components/quiz-panel";
import { type ChatMessage } from "@/components/chat-panel";
import { type Section } from "@/components/detail-view";
import {
  fallbackOverview,
  validatedOverview,
  type Overview,
} from "@/lib/overview";
import {
  getSupabaseAccessToken,
  getSupabaseBrowserClient,
  hasSupabaseBrowserConfig,
} from "@/lib/supabase-browser";

export type Topic = {
  id: string;
  code: string;
  name: string;
  specializations: Array<{
    id: string;
    name: string;
    parent_id: string | null;
    description?: string;
  }>;
};
export type ApiInput = {
  id: string;
  original_name: string;
  byte_size?: number;
  input_kind?: string;
  edited_text?: string | null;
  normalized_text?: string | null;
  original_text?: string | null;
  status?: string;
  metadata?: Record<string, unknown>;
  sourceUrl?: string | null;
  mime_type?: string;
  previewUrl?: string | null;
};
export type OutlineItem = {
  title: string;
  preview: string;
  start: number;
  end: number;
  children: OutlineItem[];
};
export type InputReport = {
  id: string;
  name: string;
  characters: number;
  words: number;
  chunkCount: number;
  structure: OutlineItem[];
};
export type ValidationReport = {
  valid: boolean;
  totalCharacters: number;
  totalWords: number;
  inputCount: number;
  chunkCount: number;
  blockingErrors: ValidationIssue[];
  warnings: ValidationIssue[];
  notes: ValidationIssue[];
  inputs: InputReport[];
};
export type Analysis = {
  id: string;
  title: string;
  status: string;
  user_id?: string | null;
  confirmed_at?: string | null;
  topic_id?: string | null;
  specialization_id?: string | null;
  custom_prompt?: string | null;
  quiz_settings?: QuizSettings;
  quiz_enabled?: boolean;
  validation_report?: ValidationReport;
  created_at?: string;
  updated_at?: string;
  completed_at?: string | null;
  error_code?: string | null;
  error_message?: string | null;
};
export type HistoryRow = Pick<
  Analysis,
  | "id"
  | "title"
  | "status"
  | "quiz_enabled"
  | "created_at"
  | "updated_at"
  | "completed_at"
  | "error_code"
>;
export type ResultJson = {
  title?: string;
  summary?: string;
  conclusion?: string;
  overview?: Overview;
  sections: Section[];
  metadata?: Record<string, unknown>;
};
export type SignedUpload = {
  inputId: string;
  name: string;
  signedUrl: string;
  mimeType: string;
  file: File;
};

export const steps = ["Tài liệu", "Kiểm tra", "Xử lý", "Kết quả"];
export const MAX_FILE_BYTES = INPUT_LIMITS.maxFileBytes;
export const HISTORY_FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "completed", label: "Hoàn thành" },
  { id: "active", label: "Đang dở" },
  { id: "failed", label: "Bị gián đoạn" },
];

export function OutlineTree({
  items,
  depth = 0,
}: {
  items: OutlineItem[];
  depth?: number;
}) {
  return (
    <div className={`outline-level outline-depth-${Math.min(depth, 3)}`}>
      {items.map((item, index) => (
        <details
          className="outline-node"
          key={`${item.start ?? index}-${item.title}`}
        >
          <summary>
            <span className="outline-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="outline-label">
              <strong>{item.title}</strong>
              <small>
                {item.children?.length
                  ? `${item.children.length} mục con · `
                  : ""}
                {typeof item.end === "number" && typeof item.start === "number"
                  ? `${(item.end - item.start).toLocaleString("vi-VN")} ký tự`
                  : "Nội dung tài liệu"}
              </small>
            </span>
            <span className="outline-chevron" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <div className="outline-body">
            {item.preview && <p>{item.preview}</p>}
            {Boolean(item.children?.length) && depth < 6 && (
              <OutlineTree items={item.children} depth={depth + 1} />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

export const GUEST_ANALYSIS_STORAGE_KEY = "documind:guest-analysis-ids";
export const guestAnalysisIds = new Set<string>();

export function hasGuestAnalysisContext(path: string) {
  if (typeof window === "undefined") return false;
  const id = path.match(/^\/api\/analyses\/([^/?]+)/)?.[1];
  if (!id) return false;
  if (guestAnalysisIds.has(id)) return true;
  try {
    const ids = JSON.parse(
      window.sessionStorage.getItem(GUEST_ANALYSIS_STORAGE_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(ids) && ids.includes(id);
  } catch {
    return false;
  }
}

export function rememberGuestAnalysis(id: string) {
  guestAnalysisIds.add(id);
  try {
    const ids = JSON.parse(
      window.sessionStorage.getItem(GUEST_ANALYSIS_STORAGE_KEY) ?? "[]",
    ) as unknown;
    const next = Array.isArray(ids)
      ? ids.filter((value): value is string => typeof value === "string")
      : [];
    if (!next.includes(id)) next.push(id);
    window.sessionStorage.setItem(
      GUEST_ANALYSIS_STORAGE_KEY,
      JSON.stringify(next.slice(-20)),
    );
  } catch {
    /* Private browsing can disable sessionStorage; the active guest cookie remains available. */
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = hasGuestAnalysisContext(path)
    ? null
    : await getSupabaseAccessToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string; details?: unknown };
  };
  if (!response.ok)
    throw new RequestFailure(
      payload.error?.message ?? `Yêu cầu thất bại (${response.status}).`,
      response.status,
      Number(response.headers.get("Retry-After")) || 0,
    );
  return payload.data as T;
}

export const Icon = AppIcon;

export function formatDate(value?: string | null) {
  if (!value) return "Vừa tạo";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const DEPTH_LABELS: Record<string, string> = {
  quick: "nhanh",
  standard: "tiêu chuẩn",
  deep: "chuyên sâu",
};

/** Builds the stored custom_prompt string; the format is read back by parseCustomPrompt. */
export function composeCustomPrompt(
  depth: string,
  specializationName: string | undefined,
  custom: string,
) {
  return [
    `Mức phân tích: ${DEPTH_LABELS[depth] ?? DEPTH_LABELS.standard}.`,
    specializationName ? `Chuyên ngành IT đã chọn: ${specializationName}.` : "",
    custom.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

export function parseCustomPrompt(value?: string | null) {
  let rest = value?.trim() ?? "";
  let depth = "standard";
  const depthMatch = /^Mức phân tích: ([^.]+)\.\s*/.exec(rest);
  if (depthMatch) {
    depth =
      Object.entries(DEPTH_LABELS).find(
        ([, label]) => label === depthMatch[1],
      )?.[0] ?? "standard";
    rest = rest.slice(depthMatch[0].length);
  }
  rest = rest.replace(/^Chuyên ngành IT đã chọn: [^.]+\.\s*/, "");
  return { depth, custom: rest };
}

export function matchesHistoryFilter(status: string, filter: string) {
  if (filter === "completed") return status === "completed";
  if (filter === "failed") return status === "failed" || status === "expired";
  if (filter === "active")
    return ["draft", "needs_review", "ready", "processing"].includes(status);
  return true;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Bản nháp",
    needs_review: "Cần kiểm tra",
    ready: "Sẵn sàng xử lý",
    processing: "Đang xử lý",
    completed: "Hoàn thành",
    failed: "Bị gián đoạn",
    expired: "Đã hết hạn",
  };
  return labels[status] ?? status;
}

export function useWorkspace() {
  const [flow, dispatch] = useReducer(
    (state: FlowState<Analysis>, action: FlowAction<Analysis>) =>
      workspaceFlow(state, action),
    { screen: "input", analysis: null, progress: null },
  );
  const { screen, analysis, progress } = flow;
  const setScreen = useCallback(
    (value: WorkspaceScreen) => dispatch({ type: "screen", value }),
    [],
  );
  const setAnalysis = useCallback(
    (
      value: Analysis | null | ((current: Analysis | null) => Analysis | null),
    ) => dispatch({ type: "analysis", value }),
    [],
  );
  const setProgress = useCallback(
    (
      value:
        | FlowState<Analysis>["progress"]
        | ((
            current: FlowState<Analysis>["progress"],
          ) => FlowState<Analysis>["progress"]),
    ) => dispatch({ type: "progress", value }),
    [],
  );
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const restored = useRef(false);
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
  const [quizConfig, setQuizConfig] = useState<QuizSettings>(quizSettings({}));
  const [reviewDirty, setReviewDirty] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const [depth, setDepth] = useState("standard");
  const [inputRows, setInputRows] = useState<ApiInput[]>([]);
  const [inputTexts, setInputTexts] = useState<Record<string, string>>({});
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [result, setResult] = useState<ResultJson | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [activeResultTab, setActiveResultTab] = useState("overview");
  const [summaryVisible, setSummaryVisible] = useState(20);
  const [conclusionVisible, setConclusionVisible] = useState(20);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizLoadError, setQuizLoadError] = useState("");
  const [chatLoadError, setChatLoadError] = useState("");
  const [quizReloading, setQuizReloading] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<
    "sign-in" | "sign-up" | "profile" | null
  >(null);

  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.code === "IT"),
    [topics],
  );
  const selectedSpecialization = useMemo(
    () =>
      selectedTopic?.specializations.find(
        (item) => item.id === specializationId,
      ),
    [selectedTopic, specializationId],
  );
  const allOutline = useMemo(
    () => report?.inputs?.flatMap((input) => input.structure ?? []) ?? outline,
    [report, outline],
  );
  const resultOverview = useMemo(
    () =>
      result
        ? (validatedOverview(result.overview) ??
          fallbackOverview(
            result.sections,
            result.title || analysis?.title || "Tài liệu",
          ))
        : null,
    [result, analysis?.title],
  );
  const resultSummary = useMemo(() => {
    const stored = result?.summary?.trim() ?? "";
    return stored.length >= 30 && stored.length <= 480
      ? stored
      : (resultOverview?.lead ?? "Tóm tắt đang được tạo từ nội dung bên dưới.");
  }, [result, resultOverview]);
  const visibleHistory = useMemo(() => {
    const needle = historyQuery.trim().toLocaleLowerCase("vi");
    return history.filter(
      (item) =>
        matchesHistoryFilter(item.status, historyFilter) &&
        (!needle || item.title.toLocaleLowerCase("vi").includes(needle)),
    );
  }, [history, historyQuery, historyFilter]);
  const resultConclusion = useMemo(
    () => (result?.conclusion?.trim() || resultSummary).slice(0, 900),
    [result, resultSummary],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("analysis");
    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      setScreen("processing");
      setBusy(true);
      setLoadingLabel("Đang khôi phục phiên và kiểm tra tiến độ đã lưu...");
    }
  }, [setScreen]);

  useEffect(() => {
    api<Topic[]>("/api/topics")
      .then((response) => setTopics(Array.isArray(response) ? response : []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig()) {
      setAuthReady(true);
      return;
    }
    const client = getSupabaseBrowserClient();
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      setAuthUser(session?.user ?? null);
      if (session && event === "SIGNED_IN") {
        window.setTimeout(() => {
          void api<{ email: string; displayName: string }>("/api/profile")
            .then((profile) => setAccountDisplayName(profile.displayName))
            .catch(() => undefined);
        }, 0);
      }
      setAuthReady(true);
      if (event === "SIGNED_OUT") {
        setAccountDisplayName("");
        setAnalysisId(null);
        setAnalysis(null);
        setResultId(null);
        setResult(null);
        setHistory([]);
        setScreen("input");
        setActiveResultTab("overview");
        setQuizQuestions([]);
        setChat([]);
        setToast("Đã đăng xuất. Phiên học riêng của tài khoản đã được đóng.");
      }
    });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setAuthUser(data.session?.user ?? null);
      setAuthReady(true);
      if (data.session) {
        void api<{ email: string; displayName: string }>("/api/profile")
          .then((profile) => {
            if (active) setAccountDisplayName(profile.displayName);
          })
          .catch(() => undefined);
      } else setAccountDisplayName("");
      if (sessionError)
        setToast(
          "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để mở lịch sử.",
        );
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setAnalysis, setScreen]);

  async function signOutFromHeader() {
    setError("");
    try {
      const { error: signOutError } =
        await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
    } catch {
      setError("Không thể đăng xuất lúc này. Kiểm tra kết nối rồi thử lại.");
    }
  }

  const metadataName =
    typeof authUser?.user_metadata?.display_name === "string"
      ? authUser.user_metadata.display_name.trim()
      : "";
  const accountName =
    accountDisplayName ||
    metadataName ||
    authUser?.email ||
    "Tài khoản DocuMind";
  const accountInitial = accountName.trim().charAt(0).toUpperCase() || "D";

  const loadResult = useCallback(
    async (id: string, analysisData?: Analysis) => {
      const resultResponse = await api<{
        analysis: Analysis;
        result: { id: string; result_json: ResultJson };
      }>(`/api/analyses/${id}/result`);
      const current = analysisData ?? resultResponse.analysis;
      setAnalysis(current);
      setQuizConfig(quizSettings(current.quiz_settings));
      setResultId(resultResponse.result.id);
      setResult(resultResponse.result.result_json);
      setSummaryVisible(20);
      setConclusionVisible(20);
      setScreen("result");
      setActiveResultTab("overview");
      const [quizResult, chatResult] = await Promise.allSettled([
        api<{ quiz: { id: string }; questions: QuizQuestion[] }>(
          `/api/analyses/${id}/quiz`,
        ),
        api<{ messages: ChatMessage[] }>(`/api/analyses/${id}/chat`),
      ]);
      if (quizResult.status === "fulfilled") {
        setQuizQuestions(quizResult.value.questions ?? []);
        setQuizLoadError(
          quizResult.value.questions?.length
            ? ""
            : current.quiz_enabled
              ? "Quiz đã được yêu cầu nhưng chưa có câu hỏi. Hãy thử tải lại hoặc chạy lại phân tích."
              : "",
        );
      } else {
        setQuizQuestions([]);
        setQuizLoadError(
          current.quiz_enabled
            ? quizResult.reason instanceof Error
              ? quizResult.reason.message
              : "Không tải được quiz."
            : "",
        );
      }
      if (chatResult.status === "fulfilled") {
        setChat(chatResult.value.messages ?? []);
        setChatLoadError("");
      } else {
        setChat([]);
        setChatLoadError(
          chatResult.reason instanceof Error
            ? chatResult.reason.message
            : "Không tải được chatbot.",
        );
      }
    },
    [setAnalysis, setScreen],
  );

  const loadHistory = useCallback(async () => {
    setError("");
    try {
      const response = await api<{ items: HistoryRow[] }>(
        "/api/analyses?limit=50",
      );
      setHistory(response.items ?? []);
      setScreen("history");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không tải được lịch sử.",
      );
    }
  }, [setScreen]);

  const refreshReview = useCallback(
    async (id: string) => {
      const validated = await api<{ status: string; report: ValidationReport }>(
        `/api/analyses/${id}/validate`,
        { method: "POST" },
      );
      setReport(validated.report);
      setOutline(
        (validated.report.inputs ?? []).flatMap((item) => item.structure),
      );
      const details = await api<{ analysis: Analysis; inputs: ApiInput[] }>(
        `/api/analyses/${id}?includeContent=true`,
      );
      setAnalysis(details.analysis);
      setInputRows(details.inputs);
      setReviewDirty(false);
      setInputTexts(
        Object.fromEntries(
          details.inputs.map((input) => [
            input.id,
            input.edited_text ??
              input.normalized_text ??
              input.original_text ??
              "",
          ]),
        ),
      );
      setScreen("review");
    },
    [setAnalysis, setScreen],
  );

  async function ingestAllFiles(id: string) {
    setScreen("processing");
    operation.current = new AbortController();
    await resumableLoop(
      async () =>
        api<{
          nextStep: string;
          remainingFiles: number;
          waitMs?: number;
          progress?: { nextUnit: number; totalUnits: number };
        }>(`/api/analyses/${id}/ingest`, {
          method: "POST",
          signal: operation.current?.signal,
        }),
      (value) => value.nextStep !== "ingest",
      (response) => {
        if (response.progress)
          setProgress({
            completed: response.progress.nextUnit,
            total: response.progress.totalUnits || 1,
          });
        setLoadingLabel(
          response.progress
            ? `Đang đọc tài liệu · ${response.progress.nextUnit}/${response.progress.totalUnits} phần · còn ${response.remainingFiles} tệp...`
            : `Đang đọc tệp tiếp theo · còn ${response.remainingFiles} tệp...`,
        );
      },
      operation.current.signal,
    );
  }

  async function completeFileUploadAndReview(
    id: string,
    uploads: SignedUpload[],
  ) {
    for (const upload of uploads) {
      const response = await fetch(upload.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": upload.mimeType,
          "cache-control": "max-age=3600",
          "x-upsert": "true",
        },
        body: upload.file,
      });
      if (!response.ok)
        throw new Error(
          `Không tải được tệp “${upload.name}”. Kiểm tra kết nối rồi chọn tiếp tục tải tệp.`,
        );
      setPendingUploads((current) =>
        current.filter((item) => item.inputId !== upload.inputId),
      );
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
    setBusy(true);
    setError("");
    try {
      if (pendingUploads.length)
        await completeFileUploadAndReview(analysisId, pendingUploads);
      else {
        setLoadingLabel(
          inputRows.every((input) => input.status === "extracted")
            ? "Hệ thống đang kiểm tra và dựng cấu trúc từ nội dung đã đọc..."
            : "Đang tiếp tục đọc các phần chưa hoàn tất từ checkpoint...",
        );
        await ingestAllFiles(analysisId);
        setPendingIngestId(null);
        await refreshReview(analysisId);
        setFiles([]);
        setText("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể tiếp tục tải và đọc tài liệu.",
      );
    } finally {
      setBusy(false);
      setLoadingLabel("");
    }
  }

  async function createAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analysisId && (pendingUploads.length || pendingIngestId)) {
      await retryIncompleteUpload();
      return;
    }
    if (!text.trim() && files.length === 0) {
      setError("Dán nội dung hoặc chọn ít nhất một tệp để bắt đầu.");
      return;
    }
    setBusy(true);
    setError("");
    setToast("");
    setLoadingLabel("Đang lưu tài liệu và chuẩn bị kiểm tra...");
    try {
      const titleValue =
        title.trim() ||
        files[0]?.name.replace(/\.[^.]+$/, "") ||
        "Phân tích mới";
      const prompt = composeCustomPrompt(
        depth,
        selectedSpecialization?.name,
        customPrompt,
      );
      const created = await api<{
        analysis: Analysis;
        inputs?: ApiInput[];
        uploads: Array<Omit<SignedUpload, "file">>;
      }>("/api/analyses", {
        method: "POST",
        body: JSON.stringify({
          title: titleValue,
          topicCode: topicMode,
          ...(topicMode === "IT" && specializationId
            ? { specializationId }
            : {}),
          ...(text.trim() ? { text } : {}),
          quizEnabled,
          quizSettings: quizConfig,
          ...(prompt ? { customPrompt: prompt } : {}),
          files: files.map((file) => ({
            name: file.name,
            byteSize: file.size,
          })),
        }),
      });
      setAnalysisId(created.analysis.id);
      setAnalysis(created.analysis);
      setInputRows(created.inputs ?? []);
      setActivities([]);
      if (!created.analysis.user_id) rememberGuestAnalysis(created.analysis.id);
      const uploads: SignedUpload[] = created.uploads
        .map((upload, index) => ({ ...upload, file: files[index] }))
        .filter((upload) => Boolean(upload.file));
      setScreen("processing");
      if (uploads.length) {
        setPendingUploads(uploads);
        setPendingIngestId(created.analysis.id);
        setLoadingLabel("Đang tải tệp trực tiếp lên kho riêng tư...");
        await completeFileUploadAndReview(created.analysis.id, uploads);
      } else {
        await refreshReview(created.analysis.id);
        setFiles([]);
        setText("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể tạo phiên phân tích.",
      );
    } finally {
      setBusy(false);
      setLoadingLabel("");
    }
  }

  async function persistReviewChanges(id: string) {
    const custom = composeCustomPrompt(
      depth,
      selectedSpecialization?.name,
      customPrompt,
    );
    await api(`/api/analyses/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({
        title: title.trim() || analysis?.title || "Phân tích mới",
        topicCode: topicMode,
        specializationId: topicMode === "IT" ? specializationId || null : null,
        customPrompt: custom || null,
        quizEnabled,
        quizSettings: quizConfig,
        inputs: inputRows.map((input) => ({
          id: input.id,
          editedText: inputTexts[input.id] ?? "",
        })),
      }),
    });
  }

  async function saveReview() {
    if (!analysisId) return;
    setBusy(true);
    setError("");
    setToast("");
    setLoadingLabel("Đang lưu nội dung đã chỉnh sửa và cập nhật cấu trúc...");
    try {
      await persistReviewChanges(analysisId);
      await refreshReview(analysisId);
      setReviewDirty(false);
      setToast("Đã lưu nội dung và cập nhật cấu trúc tài liệu.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể lưu nội dung.",
      );
    } finally {
      setBusy(false);
      setLoadingLabel("");
    }
  }

  async function confirmAndRun() {
    if (!analysisId) return;
    operation.current = new AbortController();
    setBusy(true);
    setError("");
    setToast("");
    setScreen("processing");
    setProgress(null);
    // A confirmed session (ready/failed/processing) resumes at /run; review and confirm would return 409.
    const retrying =
      ["ready", "failed", "processing"].includes(analysis?.status ?? "") &&
      Boolean(analysis?.confirmed_at);
    setLoadingLabel(
      retrying
        ? "Đang thử xử lý lại phiên đã xác nhận..."
        : "Đang xác nhận tài liệu...",
    );
    try {
      if (!retrying) {
        await persistReviewChanges(analysisId);
        const checked = await api<{ report: ValidationReport }>(
          `/api/analyses/${analysisId}/validate`,
          { method: "POST" },
        );
        if (!checked.report.valid)
          throw new Error(
            checked.report.blockingErrors
              .map((item) => `${item.location ? `${item.location}: ` : ""}${item.message}`)
              .join(" ") || "Nội dung chưa hợp lệ để xử lý.",
          );
        await api(`/api/analyses/${analysisId}/confirm`, { method: "POST" });
      }
      setLoadingLabel("AI đang phân tích từng phần tài liệu...");
      await resumableLoop(
        async () =>
          api<{
            status: "processing" | "completed";
            completedChunks?: number;
            totalChunks?: number;
            waitMs?: number;
            quizCompleted?: number;
            quizTotal?: number;
          }>(`/api/analyses/${analysisId}/run`, {
            method: "POST",
            signal: operation.current?.signal,
          }),
        (value) => value.status === "completed",
        (completed) => {
          if (completed.status === "processing") {
            setAnalysis((current) =>
              current ? { ...current, status: "processing" } : current,
            );
            if (completed.totalChunks)
              setProgress({
                completed: completed.completedChunks ?? 0,
                total: completed.totalChunks,
              });
            setLoadingLabel(
              completed.quizTotal
                ? `Đang tạo quiz · ${completed.quizCompleted ?? 0}/${completed.quizTotal} phần nguồn đã hoàn tất...`
                : `Đã xử lý ${completed.completedChunks ?? 0}/${completed.totalChunks ?? "?"} phần · đang tiếp tục...`,
            );
          }
        },
        operation.current.signal,
      );
      setProgress((current) =>
        current ? { ...current, completed: current.total } : current,
      );
      await loadResult(analysisId, {
        ...(analysis ?? { id: analysisId, title, status: "completed" }),
        status: "completed",
      });
      setToast(
        "Phân tích đã hoàn tất. Kết quả được lưu trong workspace của phiên này.",
      );
    } catch (cause) {
      const paused = operation.current?.signal.aborted;
      setError(
        paused
          ? ""
          : cause instanceof Error
            ? cause.message
            : "Quá trình phân tích bị gián đoạn.",
      );
      if (paused)
        setToast(
          "Đã tạm dừng gửi lượt mới. Lượt đang chạy trên server có thể hoàn tất; tiến độ được lưu để tiếp tục.",
        );
      setScreen(paused || retrying ? "processing" : "review");
      if (analysisId) {
        try {
          const details = await api<{ analysis: Analysis }>(
            `/api/analyses/${analysisId}`,
          );
          setAnalysis(details.analysis);
          const recovered = recoveryScreen(
            details.analysis.status,
            Boolean(details.analysis.confirmed_at),
          );
          if (recovered === "result") {
            await loadResult(analysisId, details.analysis);
            setError("");
            setToast("AI đã hoàn tất xử lý. Kết quả của phiên đã được lưu.");
          } else setScreen(recovered);
        } catch {
          /* Keep the recoverable screen when the status request is unavailable. */
        }
      }
    } finally {
      setBusy(false);
      setLoadingLabel("");
    }
  }

  async function openHistoryItem(item: HistoryRow) {
    setActivities([]);
    setPendingIngestId(null);
    setPendingUploads([]);
    setReport(null);
    setOutline([]);
    setInputRows([]);
    setActivities([]);
    setScreen("processing");
    setBusy(true);
    setError("");
    setAnalysisId(item.id);
    setTitle(item.title);
    try {
      const details = await api<{
        analysis: Analysis;
        inputs: ApiInput[];
        result: { id: string; result_json: ResultJson } | null;
      }>(`/api/analyses/${item.id}?includeContent=true`);
      setAnalysis(details.analysis);
      setTitle(details.analysis.title);
      setInputRows(details.inputs);
      setReviewDirty(false);
      // Restore the session's own settings so saving the review does not overwrite them with defaults.
      const savedPrompt = parseCustomPrompt(details.analysis.custom_prompt);
      setDepth(savedPrompt.depth);
      setCustomPrompt(savedPrompt.custom);
      setQuizEnabled(details.analysis.quiz_enabled ?? true);
      setQuizConfig(quizSettings(details.analysis.quiz_settings));
      setTopicMode(details.analysis.topic_id ? "IT" : "AUTO");
      setSpecializationId(details.analysis.specialization_id ?? "");
      setInputTexts(
        Object.fromEntries(
          details.inputs.map((input) => [
            input.id,
            input.edited_text ??
              input.normalized_text ??
              input.original_text ??
              "",
          ]),
        ),
      );
      if (!details.analysis.confirmed_at) {
        const checkpoints = details.inputs
          .map(
            (input) =>
              input.metadata?.extractionProgress as
                { nextUnit?: number; totalUnits?: number } | undefined,
          )
          .filter(Boolean);
        if (checkpoints.length)
          setProgress({
            completed: checkpoints.reduce((n, c) => n + (c?.nextUnit ?? 0), 0),
            total:
              checkpoints.reduce((n, c) => n + (c?.totalUnits ?? 0), 0) || 1,
          });
        else setProgress(null);
      }
      setReport(details.analysis.validation_report ?? null);
      setOutline(
        (details.analysis.validation_report?.inputs ?? []).flatMap(
          (input) => input.structure ?? [],
        ),
      );
      const phase = resumeState(details.analysis, details.inputs);
      if (phase === "result") await loadResult(item.id, details.analysis);
      else if (phase === "ingest" || phase === "blocked") {
        setPendingIngestId(ingestBlocked(details.inputs) ? null : item.id);
        setScreen("processing");
        setLoadingLabel(
          ingestBlocked(details.inputs)
            ? "Tệp cần tách nhỏ hoặc chuyển đổi trước khi đọc lại."
            : details.inputs.every((input) => input.status === "extracted")
              ? "Đã đọc xong nội dung. Tiếp tục để kiểm tra và dựng cấu trúc tài liệu."
              : "Đang đọc tài liệu dở. Checkpoint đã lưu; có thể tiếp tục.",
        );
        if (details.analysis.error_message)
          setError(details.analysis.error_message);
      } else if (phase === "analysis") {
        setScreen("processing");
        setLoadingLabel("Tiến độ đã lưu. Tiếp tục các phần chưa hoàn tất.");
      } else setScreen("review");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không mở được phiên phân tích.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!authReady || restored.current) return;
    restored.current = true;
    const id = new URL(window.location.href).searchParams.get("analysis");
    if (id && /^[0-9a-f-]{36}$/i.test(id))
      void openHistoryItem({
        id,
        title: "Đang khôi phục phiên",
        status: "draft",
      });
    // Restore once after authentication initializes; opening a session reads live server status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);
  useEffect(() => {
    if (!restored.current) return;
    const url = new URL(window.location.href);
    if (analysisId && screen !== "input" && screen !== "history")
      url.searchParams.set("analysis", analysisId);
    else url.searchParams.delete("analysis");
    window.history.replaceState(null, "", url);
  }, [analysisId, screen]);
  useEffect(() => {
    if (!analysisId || screen === "input" || screen === "history") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await api<{
          analysis: Analysis;
          items: Activity[];
          chunks: Array<{ status: string }>;
        }>(`/api/analyses/${analysisId}/activity`);
        if (cancelled || !state.analysis) return;
        setActivities(state.items ?? []);
        setAnalysis(state.analysis);
        if (screen === "processing" && state.analysis.confirmed_at)
          setProgress({
            completed: state.chunks.filter((c) => c.status === "complete")
              .length,
            total: state.chunks.length || 1,
          });
        if (
          screen === "processing" &&
          !busy &&
          state.analysis.status === "completed"
        ) {
          await loadResult(analysisId, state.analysis);
          return;
        }
      } catch {
        /* Keep the last known checkpoint; a transient polling failure never crashes the page. */
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 2500);
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId, screen, busy]);

  async function submitQuiz(
    answers: Record<string, number>,
  ): Promise<QuizSubmission | null> {
    if (!analysisId) return null;
    setError("");
    try {
      return await api<QuizSubmission>(
        `/api/analyses/${analysisId}/quiz/attempts`,
        { method: "POST", body: JSON.stringify({ answers }) },
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không gửi được bài quiz.",
      );
      return null;
    }
  }

  async function sendChat(message: string) {
    if (!analysisId) return false;
    setChat((current) => [...current, { role: "user", content: message }]);
    setChatPending(true);
    setError("");
    try {
      const response = await api<{ assistantMessage: ChatMessage }>(
        `/api/analyses/${analysisId}/chat`,
        { method: "POST", body: JSON.stringify({ message }) },
      );
      setChat((current) => [...current, response.assistantMessage]);
      return true;
    } catch (cause) {
      setChat((current) => current.slice(0, -1));
      setError(
        cause instanceof Error ? cause.message : "Không gửi được câu hỏi.",
      );
      return false;
    } finally {
      setChatPending(false);
    }
  }

  async function reloadQuiz() {
    if (!analysisId) return;
    setQuizReloading(true);
    setQuizLoadError("");
    try {
      const response = await api<{
        quiz: { id: string };
        questions: QuizQuestion[];
      }>(`/api/analyses/${analysisId}/quiz`, { method: "POST" });
      setQuizQuestions(response.questions ?? []);
      if (!response.questions?.length)
        setQuizLoadError(
          "Quiz chưa có câu hỏi. Hãy chạy lại phân tích sau khi hệ thống cập nhật.",
        );
    } catch (cause) {
      setQuizLoadError(
        cause instanceof Error ? cause.message : "Không tải được quiz.",
      );
    } finally {
      setQuizReloading(false);
    }
  }

  async function reloadChat() {
    if (!analysisId) return;
    setChatLoadError("");
    try {
      const response = await api<{ messages: ChatMessage[] }>(
        `/api/analyses/${analysisId}/chat`,
      );
      setChat(response.messages ?? []);
    } catch (cause) {
      setChatLoadError(
        cause instanceof Error ? cause.message : "Không tải được chatbot.",
      );
    }
  }

  async function exportResult(
    format: "pdf" | "docx" | "markdown" | "html" | "json",
  ) {
    if (!analysisId) return;
    setBusy(true);
    setError("");
    try {
      if (resultId && result) {
        const diagrams = Array.from(
          new Set(
            result.sections
              .flatMap((section) => section.blocks)
              .filter(
                (block) =>
                  block.contentType === "mermaid" ||
                  block.type === "mermaid" ||
                  (block.type === "diagram" &&
                    !block.contentType &&
                    typeof block.content === "string" &&
                    /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey)\b/.test(
                      block.content.trim(),
                    )),
              )
              .map((block) =>
                typeof block.content === "string" ? block.content.trim() : "",
              )
              .filter(Boolean),
          ),
        );
        if (diagrams.length) {
          setLoadingLabel("Đang chuẩn bị ảnh sơ đồ cho báo cáo...");
          const { default: mermaid } = await import("mermaid");
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral",
            htmlLabels: false,
            flowchart: { htmlLabels: false },
            suppressErrorRendering: true,
          });
          let sourceOnly = 0;
          for (const [index, source] of diagrams.entries()) {
            try {
              if (
                source.length > 10000 ||
                !(await mermaid.parse(source, { suppressErrors: true }))
              ) {
                sourceOnly++;
                continue;
              }
              const svg = await renderMermaid(
                source,
                `export-diagram-${Date.now()}-${index}`,
              );
              await api(`/api/analyses/${analysisId}/assets`, {
                method: "POST",
                body: JSON.stringify({
                  resultId,
                  assetType: "mermaid",
                  source,
                  svg,
                  title: "Sơ đồ báo cáo",
                }),
              });
            } catch {
              sourceOnly++;
            }
          }
          if (sourceOnly) throw new Error(`${sourceOnly} sơ đồ chưa dựng được ảnh. Kiểm tra mã sơ đồ trong kết quả rồi thử lại; báo cáo chưa được xuất để tránh thiếu ảnh.`);
        }
      }
      setLoadingLabel("Đang tạo tệp báo cáo...");
      const response = await api<{ downloadUrl: string }>(
        `/api/analyses/${analysisId}/exports`,
        { method: "POST", body: JSON.stringify({ format }) },
      );
      const download = await fetch(response.downloadUrl);
      if (!download.ok)
        throw new Error("Không tải được báo cáo. Hãy thử tạo lại liên kết.");
      const blob = await download.blob(),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `documind-report.${format === "markdown" ? "zip" : format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không xuất được tài liệu.",
      );
    } finally {
      setBusy(false);
      setLoadingLabel("");
    }
  }

  function addFiles(accepted: File[]) {
    // Dropped files bypass the input's accept attribute, so check extensions here too.
    const unsupported = accepted.find((file) => !supportedFile(file.name));
    const empty = accepted.find((file) => file.size === 0);
    const tooLarge = accepted.find((file) => file.size > MAX_FILE_BYTES);
    const known = new Set(
      files.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
    );
    const valid = accepted.filter(
      (file) =>
        file !== unsupported &&
        file.size > 0 &&
        file.size <= MAX_FILE_BYTES &&
        supportedFile(file.name) &&
        !known.has(`${file.name}:${file.size}:${file.lastModified}`),
    );
    if (unsupported)
      setError(
        `Tệp “${unsupported.name}” chưa được hỗ trợ. Hãy dùng PDF, DOCX, văn bản/mã nguồn hoặc PNG/JPG.`,
      );
    else if (empty)
      setError(
        `Tệp “${empty.name}” không có dữ liệu. Hãy chọn lại tệp gốc từ thiết bị.`,
      );
    else if (tooLarge) setError(`Tệp “${tooLarge.name}” vượt giới hạn 20 MB.`);
    else if (files.length + valid.length > INPUT_LIMITS.maxFiles)
      setError(
        "Mỗi phân tích chỉ nhận tối đa 10 tệp. Hãy bỏ bớt tệp rồi thử lại.",
      );
    else setError("");
    setFiles((current) =>
      [...current, ...valid].slice(0, INPUT_LIMITS.maxFiles),
    );
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  const stepIndex =
    screen === "input"
      ? 0
      : screen === "review"
        ? 1
        : screen === "processing"
          ? analysis?.confirmed_at
            ? 2
            : 0
          : 3;
  const resultHeadings: Record<string, string> = {
    overview: "Tổng quan tài liệu",
    summary: "Tóm tắt tài liệu",
    detail: "Phân tích chi tiết",
    conclusion: "Kết luận tổng hợp",
    quiz: "Quiz ôn tập",
    chat: "Hỏi đáp cùng AI",
    report: "Xuất báo cáo",
  };
  const heading =
    screen === "input"
      ? "Biến tài liệu thành tri thức"
      : screen === "review"
        ? "Kiểm tra tài liệu trước khi xử lý"
        : screen === "processing"
          ? analysis?.confirmed_at
            ? "Đang xây dựng workspace học tập"
            : "Đang chuẩn bị đầu vào"
          : screen === "history"
            ? "Lịch sử phân tích"
            : (resultHeadings[activeResultTab] ?? resultHeadings.overview);

  return {
    screen,
    setScreen,
    analysisId,
    setAnalysisId,
    analysis,
    setAnalysis,
    activities,
    topics,
    setTopics,
    files,
    setFiles,
    pendingUploads,
    setPendingUploads,
    pendingIngestId,
    setPendingIngestId,
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
    reviewDirty,
    setReviewDirty,
    operation,
    depth,
    setDepth,
    inputRows,
    setInputRows,
    inputTexts,
    setInputTexts,
    report,
    setReport,
    outline,
    setOutline,
    history,
    setHistory,
    result,
    setResult,
    resultId,
    setResultId,
    activeResultTab,
    setActiveResultTab,
    summaryVisible,
    setSummaryVisible,
    conclusionVisible,
    setConclusionVisible,
    quizQuestions,
    setQuizQuestions,
    quizLoadError,
    setQuizLoadError,
    chatLoadError,
    setChatLoadError,
    quizReloading,
    setQuizReloading,
    chat,
    setChat,
    chatPending,
    setChatPending,
    progress,
    setProgress,
    historyQuery,
    setHistoryQuery,
    historyFilter,
    setHistoryFilter,
    busy,
    setBusy,
    loadingLabel,
    setLoadingLabel,
    error,
    setError,
    toast,
    setToast,
    authUser,
    setAuthUser,
    accountDisplayName,
    setAccountDisplayName,
    authReady,
    setAuthReady,
    authMode,
    setAuthMode,
    selectedTopic,
    selectedSpecialization,
    allOutline,
    resultOverview,
    resultSummary,
    visibleHistory,
    resultConclusion,
    signOutFromHeader,
    metadataName,
    accountName,
    accountInitial,
    loadResult,
    loadHistory,
    refreshReview,
    ingestAllFiles,
    completeFileUploadAndReview,
    retryIncompleteUpload,
    createAnalysis,
    persistReviewChanges,
    saveReview,
    confirmAndRun,
    openHistoryItem,
    submitQuiz,
    sendChat,
    reloadQuiz,
    reloadChat,
    exportResult,
    addFiles,
    onFileChange,
    stepIndex,
    resultHeadings,
    heading,
    steps,
    MAX_FILE_BYTES,
    HISTORY_FILTERS,
    OutlineTree,
    Icon,
    formatDate,
    matchesHistoryFilter,
    statusLabel,
    api,
    FILE_ACCEPT,
    INPUT_LIMITS,
  };
}
export type WorkspaceContext = ReturnType<typeof useWorkspace>;
