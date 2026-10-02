import { z } from "zod";
export const quizSettingsSchema = z.object({
  questionCount: z
    .number()
    .int()
    .min(1)
    .max(Number.MAX_SAFE_INTEGER)
    .default(20),
  difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
  types: z
    .array(z.enum(["multiple_choice", "true_false"]))
    .min(1)
    .max(2)
    .default(["multiple_choice"]),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;
export function quizSettings(value: unknown): QuizSettings {
  const parsed = quizSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : quizSettingsSchema.parse({});
}
export function quizQuotas(lengths: number[], count: number) {
  if (!lengths.length) return [];
  const total = lengths.reduce((a, b) => a + Math.max(1, b), 0);
  const raw = lengths.map((n) => (count * Math.max(1, n)) / Math.max(1, total));
  const quota = raw.map(Math.floor);
  const order = raw
    .map((n, i) => ({ i, r: n - quota[i] }))
    .sort((a, b) => b.r - a.r);
  const remaining = count - quota.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) quota[order[i].i]++;
  return quota;
}

export function quizOutputSchema(settings: QuizSettings) {
  const question = {
    type: "object",
    required: [
      "prompt",
      "options",
      "answerIndex",
      "explanation",
      "difficulty",
      "questionType",
    ],
    properties: {
      prompt: { type: "string" },
      options: { type: "array", items: { type: "string" } },
      answerIndex: { type: "integer" },
      explanation: { type: "string" },
      difficulty: {
        type: "string",
        enum:
          settings.difficulty === "mixed"
            ? ["easy", "medium", "hard"]
            : [settings.difficulty],
      },
      questionType: { type: "string", enum: settings.types },
    },
  };
  return {
    type: "object",
    required: ["questions"],
    properties: { questions: { type: "array", items: question } },
  };
}
