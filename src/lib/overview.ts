export type SummarySection = { title: string; summary?: string; blocks?: Array<{ type: string; content: unknown; contentType?: string }> };
export type Overview = { lead: string; highlights: Array<{ title: string; detail: string }> };

function brief(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit);
  const sentence = Math.max(excerpt.lastIndexOf(". "), excerpt.lastIndexOf("; "));
  return `${(sentence > limit * .55 ? excerpt.slice(0, sentence + 1) : excerpt).trim()}…`;
}

export function fallbackOverview(sections: SummarySection[], title = "Tài liệu"): Overview {
  const meaningful = sections.filter(section => section.title?.trim() && (section.summary?.trim() || section.blocks?.length));
  const unique: SummarySection[] = [];
  const keys = new Set<string>();
  for (const section of meaningful) {
    const key = section.title.toLocaleLowerCase("vi").replace(/^[\d.]+\s*/, "").trim();
    if (keys.has(key)) continue;
    keys.add(key); unique.push(section);
  }
  const selected = unique.length <= 6 ? unique : Array.from({ length: 6 }, (_, index) => unique[Math.floor(index * (unique.length - 1) / 5)]);
  const highlights = selected.map(section => ({
    title: brief(section.title, 110),
    detail: brief(section.summary?.trim() || "Xem phân tích chi tiết và nội dung nguồn của mục này.", 210),
  }));
  return { lead: `Tài liệu “${brief(title, 100)}” gồm ${sections.length} mục phân tích. Các điểm chính được sắp theo tiêu đề bên dưới; mở Chi tiết để xem căn cứ, sơ đồ và công thức.`, highlights };
}

export function summaryContext(sections: SummarySection[]) {
  const sampled = sections.length <= 120 ? sections : Array.from({ length: 120 }, (_, index) => sections[Math.floor(index * (sections.length - 1) / 119)]);
  return sampled.map((section, index) => `${index + 1}. ${brief(section.title, 100)}: ${brief(section.summary ?? "", 150)}`).join("\n").slice(0, 26000);
}

export function validatedOverview(value: unknown): Overview | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.lead !== "string" || record.lead.trim().length < 30 || !Array.isArray(record.highlights)) return null;
  const highlights = record.highlights.slice(0, 7).flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const point = item as Record<string, unknown>;
    return typeof point.title === "string" && typeof point.detail === "string" && point.title.trim() && point.detail.trim()
      ? [{ title: brief(point.title, 110), detail: brief(point.detail, 230) }] : [];
  });
  if (highlights.length < 2) return null;
  return { lead: brief(record.lead, 480), highlights };
}
