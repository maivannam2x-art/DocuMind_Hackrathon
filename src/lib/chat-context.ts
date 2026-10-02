import { blockToPlainText, type ResultBlock } from "@/lib/result-content";
const stop = new Set(
  "va la cua cho voi cac nhung mot trong ve hay toi ban gi nhu nao the duoc tu co khong nay hay explain what how the a an is are to of and in on for".split(
    " ",
  ),
);
export function searchTerms(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replaceAll("đ", "d")
      .toLowerCase()
      .match(/[a-z0-9_]+/g)
      ?.filter((t) => t.length > 1 && !stop.has(t)) ?? []
  );
}
export type ChatPassage = { title: string; text: string; sourceId?: string };
/** Rank paragraph windows from every section and source chunk, rather than
 * taking the first 8k characters of serialized JSON. Return complete JSON. */
export function retrieveChatContext(
  result: {
    summary?: string;
    sections?: Array<{
      title: string;
      summary?: string;
      blocks?: ResultBlock[];
    }>;
  },
  chunks: Array<{ id: string; title?: string | null; content: string }>,
  question: string,
  budget = 10000,
) {
  const passages: ChatPassage[] = [];
  const add = (title: string, text: string, sourceId?: string) => {
    for (let i = 0; i < text.length; i += 1200)
      passages.push({
        title,
        text: text.slice(i, i + 1400),
        ...(sourceId ? { sourceId } : {}),
      });
  };
  result.sections?.forEach((s) =>
    add(
      s.title,
      [s.summary, ...(s.blocks ?? []).map(blockToPlainText)]
        .filter(Boolean)
        .join("\n"),
    ),
  );
  chunks.forEach((c) => add(c.title || "Tài liệu nguồn", c.content, c.id));
  const query = [...new Set(searchTerms(question))],
    tokens = passages.map((p) => searchTerms(p.title + " " + p.text));
  const average =
    tokens.reduce((sum, t) => sum + t.length, 0) / Math.max(1, tokens.length);
  const frequency = new Map(
    query.map((q) => [q, tokens.filter((t) => t.includes(q)).length]),
  );
  const ranked = passages
    .map((p, i) => ({
      p,
      i,
      score: query.reduce((score, q) => {
        const tf = tokens[i].filter((t) => t === q).length,
          df = frequency.get(q) ?? 0;
        const idf = Math.log(1 + (passages.length - df + 0.5) / (df + 0.5));
        return (
          score +
          (idf * tf * 2.2) /
            (tf +
              1.2 * (0.25 + (0.75 * tokens[i].length) / Math.max(1, average))) +
          (searchTerms(p.title).includes(q) ? 1 : 0)
        );
      }, 0),
    }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const selected: ChatPassage[] = [],
    seen = new Set<string>();
  const context = {
    summary: (result.summary ?? "").slice(0, 700),
    passages: selected,
  };
  // No keywords: diversify rather than only returning the first chapter.
  const candidates = ranked.some((r) => r.score > 0)
    ? ranked
    : ranked.filter(
        (r, i) => i % Math.max(1, Math.floor(ranked.length / 6)) === 0,
      );
  for (const { p } of candidates) {
    if (seen.has(p.text) || selected.length >= 7) continue;
    selected.push(p);
    if (JSON.stringify(context).length > budget) {
      selected.pop();
      continue;
    }
    seen.add(p.text);
  }
  return context;
}
