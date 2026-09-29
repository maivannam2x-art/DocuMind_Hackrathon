export type QuizCandidate = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "true_false";
  chunkId: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(option => typeof option === "string" ? option.trim() : String(asRecord(option)?.text ?? "").trim()).filter(Boolean);
}

function answerIndex(value: unknown, options: string[]): number | null {
  if (Number.isInteger(value)) return Number(value);
  if (typeof value === "string") {
    const match = value.trim().match(/^[A-D]$/i);
    if (match) return match[0].toUpperCase().charCodeAt(0) - 65;
    const index = options.findIndex(option => option.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
    if (index >= 0) return index;
    const numeric = Number(value);
    if (Number.isInteger(numeric)) return numeric;
  }
  return null;
}

function candidatesFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  if (Array.isArray(record.questions)) return record.questions;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(asRecord(record.quiz)?.questions)) return (asRecord(record.quiz)?.questions as unknown[]);
  return [];
}

export function normalizeQuizCandidates(value: unknown, chunkId: string): QuizCandidate[] {
  const normalized: QuizCandidate[] = [];
  for (const item of candidatesFrom(value)) {
    const q = asRecord(item);
    if (!q) continue;
    const prompt = String(q.prompt ?? q.question ?? q.text ?? "").trim();
    const options = stringOptions(q.options ?? q.choices ?? q.answers);
    const index = answerIndex(q.answerIndex ?? q.correctIndex ?? q.correctAnswer ?? q.answer, options);
    if (prompt.length < 8 || options.length < 2 || index === null || index < 0 || index >= options.length) continue;
    normalized.push({
      prompt,
      options,
      answerIndex: index,
      explanation: String(q.explanation ?? q.rationale ?? "Đáp án được đối chiếu với nội dung nguồn.").trim(),
      difficulty: q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium",
      questionType: q.questionType === "true_false" || q.type === "true_false" ? "true_false" : "multiple_choice",
      chunkId,
    });
  }
  return normalized;
}

export function createSourceGroundedFallback(source: string, chunkId: string, limit = 3): QuizCandidate[] {
  const sentences = source
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 28);
  const statements = (sentences.length ? sentences : [source.replace(/\s+/g, " ").trim()])
    .filter(sentence => sentence.length >= 28)
    .slice(0, limit);
  return statements.map((statement, index) => ({
    prompt: `Tài liệu có hỗ trợ phát biểu sau không? “${statement.slice(0, 450)}”`,
    options: ["Có, phát biểu phù hợp với tài liệu", "Không, tài liệu không hỗ trợ phát biểu này"],
    answerIndex: 0,
    explanation: "Phát biểu được trích trực tiếp từ phần tài liệu đã gửi.",
    difficulty: index === 0 ? "easy" : "medium",
    questionType: "true_false",
    chunkId,
  }));
}
