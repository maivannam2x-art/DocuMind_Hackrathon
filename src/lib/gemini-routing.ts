import { createHash } from "node:crypto";
export const DEFAULT_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.1-pro-preview",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
let cached:
  { fingerprint: string; until: number; models: Set<string> } | undefined;
export function configuredModels() {
  return [
    ...new Set([
      process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      ...(process.env.GEMINI_FALLBACK_MODELS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? DEFAULT_GEMINI_MODELS),
    ]),
  ];
}
export function textModel(model: {
  name?: string;
  supportedGenerationMethods?: string[];
}) {
  return Boolean(
    model.name?.startsWith("models/gemini-") &&
    model.supportedGenerationMethods?.includes("generateContent") &&
    !/image|audio|tts|live|embedding|robotics|computer-use/i.test(model.name),
  );
}
/** Intersect operator-approved candidates with the live API catalog; never invent model IDs. */
export async function availableModels(key: string) {
  const fingerprint = createHash("sha256").update(key).digest("hex");
  if (cached?.fingerprint === fingerprint && cached.until > Date.now())
    return configuredModels().filter((m) => cached!.models.has(m));
  try {
    const names = new Set<string>();
    let token = "";
    do {
      const url = new URL(
        "https://generativelanguage.googleapis.com/v1beta/models",
      );
      url.searchParams.set("pageSize", "1000");
      if (token) url.searchParams.set("pageToken", token);
      const r = await fetch(url, {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw Error("catalog unavailable");
      const p = await r.json();
      for (const m of p.models ?? [])
        if (textModel(m)) names.add(m.name.replace(/^models\//, ""));
      token = p.nextPageToken ?? "";
    } while (token);
    cached = { fingerprint, until: Date.now() + 300000, models: names };
    return configuredModels().filter((m) => names.has(m));
  } catch {
    return configuredModels();
  }
}
export function resetModelCache() {
  cached = undefined;
}
