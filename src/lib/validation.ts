import { INPUT_LIMITS } from "@/lib/limits";
import { quizSettingsSchema } from "@/lib/quiz-settings";
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
  quizSettings: quizSettingsSchema.optional(),
  text: z.string().max(INPUT_LIMITS.maxTextCharacters).optional(),
  files: z.array(z.object({
    name: z.string().trim().min(1).max(255),
    byteSize: z.number().int().positive().max(INPUT_LIMITS.maxFileBytes),
  })).max(INPUT_LIMITS.maxFiles).optional(),
});

export const resultSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  conclusion: z.string().optional(),
  sections: z.array(z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    blocks: z.array(z.object({
      type: z.string().min(1),
      content: z.unknown(),
      contentType: z.enum(["text", "json", "latex", "mermaid", "plantuml", "table", "code", "image"]).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).superRefine((block, context) => {
      const structured = block.content !== null && typeof block.content === "object" && !(Array.isArray(block.content) && ["list", "key_points"].includes(block.type));
      if (structured && !block.contentType) context.addIssue({ code: "custom", path: ["contentType"], message: "Nội dung dạng object/array phải có contentType rõ ràng, ví dụ json, table hoặc mermaid." });
    })).min(1),
  })).min(1),
}).passthrough();

function normalizeBlock(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const block = value as Record<string, unknown>;
  let type = typeof block.type === "string" ? block.type : "paragraph";
  let contentType = typeof block.contentType === "string" ? block.contentType : undefined;
  let content = block.content;
  if (typeof content === "string") {
    let text = content;
    const fenced = text.trim().match(/^```(mermaid|plantuml|latex|tex|json)\s*\n([\s\S]*?)\n?```$/i);
    if (fenced) {
      const language = fenced[1].toLowerCase();
      text = fenced[2].trim();
      contentType = language === "tex" ? "latex" : language;
      if (language === "mermaid" || language === "plantuml") type = "diagram";
      else if (language === "latex" || language === "tex") type = "formula";
      else type = "json";
    } else if (!contentType && /^(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))$/.test(text.trim())) {
      contentType = "latex";
      type = "formula";
      text = text.trim().replace(/^(?:\$\$?|\\\[|\\\()\s*/, "").replace(/\s*(?:\$\$?|\\\]|\\\))$/, "");
    } else if (!contentType && type.toLowerCase() === "diagram" && /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|journey|requirementDiagram)\b/.test(text.trim())) {
      contentType = "mermaid";
    }
    if (contentType === "latex" || ["formula", "math", "equation"].includes(type.toLowerCase())) {
      contentType = "latex";
      type = "formula";
      text = text.trim().replace(/^(?:\$\$?|\\\[|\\\()\s*/, "").replace(/\s*(?:\$\$?|\\\]|\\\))$/, "");
    }
    if (contentType === "json" || type.toLowerCase() === "json") {
      contentType = "json";
      type = "json";
      try { content = JSON.parse(text); } catch { content = text; /* keep a tagged JSON string so the UI never mistakes it for prose */ }
    } else if (!contentType && /^[\[{][\s\S]*[\]}]$/.test(text.trim())) {
      try {
        const structured = JSON.parse(text);
        if (structured !== null && typeof structured === "object") {
          content = structured;
          contentType = Array.isArray(structured) ? "json" : "json";
          type = "json";
        }
      } catch { /* ordinary prose that happens to use brackets remains text */ }
    }
    if (typeof content === "string") content = text;
  }
  return { ...block, type, content, ...(contentType ? { contentType } : {}) };
}

export function normalizeResult(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.sections)) return value;
  return {
    ...result,
    sections: result.sections.map(section => {
      if (!section || typeof section !== "object" || Array.isArray(section)) return section;
      const current = section as Record<string, unknown>;
      return { ...current, ...(Array.isArray(current.blocks) ? { blocks: current.blocks.map(normalizeBlock) } : {}) };
    }),
  };
}

export function assertResult(value: unknown) {
  const parsed = resultSchema.safeParse(normalizeResult(value));
  if (!parsed.success) throw new ApiError(422, "INVALID_LLM_OUTPUT", "LLM trả kết quả không đúng cấu trúc sections/blocks.", parsed.error.issues);
  return parsed.data;
}

export function safeBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "INVALID_REQUEST", "Dữ liệu gửi lên không hợp lệ.", parsed.error.issues);
  return parsed.data;
}

export function assertHasAnalysisInput(text: string | undefined, multipartFileCount: number, stagedFileCount: number) {
  if (!text?.trim() && multipartFileCount === 0 && stagedFileCount === 0) {
    throw new ApiError(400, "INPUT_REQUIRED", "Dán nội dung hoặc tải lên ít nhất một tệp.");
  }
}
