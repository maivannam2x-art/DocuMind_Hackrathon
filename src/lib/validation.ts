import { z } from "zod";
import { ApiError } from "@/lib/http";

export const createAnalysisSchema = z.object({
  title: z.string().trim().max(200).optional(),
  topicCode: z.string().trim().max(80).optional(),
  specializationId: z.string().uuid().optional(),
  promptTemplateId: z.string().uuid().optional(),
  customPrompt: z.string().trim().max(3000).optional(),
  quizEnabled: z.preprocess((value) => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
  }, z.boolean()).optional(),
  text: z.string().max(500000).optional(),
});

export const resultSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  sections: z.array(z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    blocks: z.array(z.object({
      type: z.string().min(1),
      content: z.unknown(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })).min(1),
  })).min(1),
}).passthrough();

export function assertResult(value: unknown) {
  const parsed = resultSchema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, "INVALID_LLM_OUTPUT", "LLM trả kết quả không đúng cấu trúc sections/blocks.", parsed.error.issues);
  return parsed.data;
}

export function safeBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST", "Dữ liệu gửi lên không hợp lệ.", parsed.error.issues);
  return parsed.data;
}
