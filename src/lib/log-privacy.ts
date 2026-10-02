import { createHash } from "node:crypto";
export function privateLogPayload(value: unknown) {
  if (process.env.LLM_LOG_CONTENT === "true") return value;
  const text = JSON.stringify(value ?? null);
  return {
    redacted: true,
    characters: text.length,
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}
