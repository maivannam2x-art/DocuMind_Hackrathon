// Deterministic, source-grounded quiz builder. It powers the mock LLM provider
// and the fallback used when a real model returns too few valid questions, so
// it must never invent facts: every correct answer is copied from the source.

export type StaticQuizQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  questionType: "multiple_choice" | "true_false";
};

const TRUE_FALSE = ["Đúng", "Sai"];
const STOP_TERMS = new Set(["the", "and", "for", "with", "this", "that", "from", "một", "các", "những", "được", "trong", "của", "này", "khi", "với", "theo", "tài liệu", "nội dung", "ví dụ"]);

export function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0;
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** Moves the correct option to a seed-dependent position so answers are not always A. */
export function shuffleOptions<T extends { options: string[]; answerIndex: number; questionType?: string }>(question: T, seed: number): T {
  if (question.questionType === "true_false" || question.options.length < 3) return question;
  const order = seededShuffle(question.options.map((_, index) => index), seed);
  return { ...question, options: order.map(index => question.options[index]), answerIndex: order.indexOf(question.answerIndex) };
}

function clip(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trim()}…`;
}

export function sourceSentences(source: string) {
  return source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\|/g, " ")
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(sentence => sentence.replace(/\s+/g, " ").trim())
    .filter(sentence => sentence.length >= 28 && sentence.length <= 320 && /[\p{L}]{3}/u.test(sentence));
}

/** Technical-looking terms: acronyms, CamelCase/code identifiers, quoted phrases and defined subjects. */
export function keyTerms(source: string) {
  const counts = new Map<string, number>();
  const add = (term: string, weight = 1) => {
    const value = term.trim().replace(/^[“"'`(]+|[”"'`),.:;]+$/g, "");
    if (value.length < 2 || value.length > 48 || STOP_TERMS.has(value.toLocaleLowerCase("vi")) || /^\d+$/.test(value)) return;
    counts.set(value, (counts.get(value) ?? 0) + weight);
  };
  for (const match of source.matchAll(/`([^`\n]{2,40})`|“([^”\n]{2,40})”|"([^"\n]{2,40})"/g)) add(match[1] ?? match[2] ?? match[3], 3);
  // `\b` is ASCII-only, so Vietnamese words like "Khóa" would yield "Kh"; use Unicode-aware boundaries.
  for (const match of source.matchAll(/(?<![\p{L}\p{N}])[A-Z][A-Z0-9]{1,9}(?:[/-][A-Z0-9]{1,9})?(?![\p{L}\p{N}])/gu)) add(match[0], 2);
  for (const match of source.matchAll(/(?<![\p{L}\p{N}])(?:[A-Za-z]+(?:[A-Z][a-z0-9]+)+|[a-z]+_[a-z_]+|[A-Z][a-z]+(?: [A-Z][a-z]+){0,2})(?![\p{L}\p{N}])/gu)) add(match[0]);
  for (const sentence of sourceSentences(source)) {
    const subject = sentence.match(/^(.{2,40}?)\s+(?:là|được gọi là|được định nghĩa là|is|are|refers to)\s+/i)?.[1];
    if (subject && subject.split(/\s+/).length <= 5) add(subject, 3);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([term]) => term);
}

const isAcronym = (term: string) => /^[A-Z0-9/-]+$/.test(term);

/** Orders candidate substitutes so terms of the same shape (acronym vs. phrase) come first. */
function similarTerms(term: string, terms: string[]) {
  return [...terms.filter(other => isAcronym(other) === isAcronym(term)), ...terms.filter(other => isAcronym(other) !== isAcronym(term))];
}

function definitionQuestion(sentence: string, others: string[], seed: number): StaticQuizQuestion | null {
  const match = sentence.match(/^(.{2,40}?)\s+(là|được gọi là|được định nghĩa là)\s+(.{12,})$/i);
  if (!match || match[1].split(/\s+/).length > 5) return null;
  const answer = clip(match[3].replace(/[.!?]$/, ""), 150);
  const distractors = others.map(other => clip(other.replace(/^(.{2,40}?)\s+(là|được gọi là|được định nghĩa là)\s+/i, "").replace(/[.!?]$/, ""), 150))
    .filter(option => option.toLocaleLowerCase("vi") !== answer.toLocaleLowerCase("vi")).slice(0, 3);
  if (distractors.length < 2) return null;
  return shuffleOptions<StaticQuizQuestion>({
    prompt: `Theo tài liệu, “${match[1].trim()}” ${match[2]} gì?`,
    options: [answer, ...distractors], answerIndex: 0,
    explanation: `Căn cứ: “${clip(sentence, 260)}”`, difficulty: "easy", questionType: "multiple_choice",
  }, seed);
}

function clozeQuestion(sentence: string, terms: string[], seed: number): StaticQuizQuestion | null {
  const term = terms.find(candidate => sentence.includes(candidate) && sentence.length - candidate.length > 20);
  if (!term) return null;
  const distractors = similarTerms(term, seededShuffle(terms.filter(candidate => candidate !== term && !sentence.includes(candidate) && candidate.toLocaleLowerCase("vi") !== term.toLocaleLowerCase("vi")), seed)).slice(0, 3);
  if (distractors.length < 2) return null;
  return shuffleOptions<StaticQuizQuestion>({
    prompt: `Điền vào chỗ trống theo đúng tài liệu: “${clip(sentence.replace(term, "_____"), 300)}”`,
    options: [term, ...distractors], answerIndex: 0,
    explanation: `Câu gốc trong tài liệu: “${clip(sentence, 260)}”`, difficulty: "medium", questionType: "multiple_choice",
  }, seed);
}

function trueFalseQuestion(sentence: string, terms: string[], seed: number): StaticQuizQuestion {
  // Roughly half of the statements are altered by swapping one technical term
  // for another term from the same source, so "Đúng" is not always correct.
  const term = terms.find(candidate => sentence.includes(candidate));
  const replacement = term ? similarTerms(term, terms).find(candidate => candidate !== term && !sentence.includes(candidate)) : undefined;
  const altered = Boolean(term && replacement) && seed % 2 === 1;
  const statement = altered ? sentence.replace(term!, replacement!) : sentence;
  return {
    prompt: `Phát biểu sau đúng hay sai theo tài liệu? “${clip(statement, 360)}”`,
    options: TRUE_FALSE, answerIndex: altered ? 1 : 0,
    explanation: altered ? `Sai: tài liệu nói về “${term}”, không phải “${replacement}”. Câu gốc: “${clip(sentence, 240)}”` : `Đúng: câu này được trích từ tài liệu.`,
    difficulty: altered ? "hard" : "easy", questionType: "true_false",
  };
}

/** Builds up to `limit` mixed questions (definition, fill-in-the-blank, true/false) from source text. */
export function buildStaticQuiz(source: string, limit = 3, salt = ""): StaticQuizQuestion[] {
  const sentences = sourceSentences(source);
  if (!sentences.length) {
    const fallback = source.replace(/\s+/g, " ").trim();
    return fallback.length >= 28 ? [trueFalseQuestion(clip(fallback, 300), [], 0)] : [];
  }
  const terms = keyTerms(source);
  const definitions = sentences.filter(sentence => /\s(là|được gọi là|được định nghĩa là)\s/i.test(sentence));
  const ordered = seededShuffle(sentences, hashSeed(salt + source.slice(0, 400)));
  const questions: StaticQuizQuestion[] = [];
  const used = new Set<string>();
  const kinds = ["definition", "cloze", "true_false"] as const;
  const build = (kind: (typeof kinds)[number], sentence: string) => {
    const seed = hashSeed(`${salt}:${sentence}`);
    if (kind === "definition") return definitionQuestion(sentence, definitions.filter(other => other !== sentence), seed);
    if (kind === "cloze") return clozeQuestion(sentence, terms, seed);
    return trueFalseQuestion(sentence, terms, seed);
  };
  while (questions.length < limit) {
    // Rotate the preferred kind for variety; true/false always succeeds, so a
    // question is produced as long as an unused sentence remains.
    const preferred = kinds[questions.length % kinds.length];
    let picked: { sentence: string; question: StaticQuizQuestion } | null = null;
    for (const kind of [preferred, ...kinds.filter(other => other !== preferred)]) {
      for (const sentence of ordered) {
        if (used.has(sentence)) continue;
        const question = build(kind, sentence);
        if (question) { picked = { sentence, question }; break; }
      }
      if (picked) break;
    }
    if (!picked) break;
    used.add(picked.sentence);
    questions.push(picked.question);
  }
  return questions;
}
