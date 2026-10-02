"use client";
import { useDeferredValue, useMemo, useState } from "react";
import { ResultBlockView } from "@/components/result-block";
import { blockToPlainText, type ResultBlock } from "@/lib/result-content";

export type Section = { title: string; summary?: string; blocks: ResultBlock[] };

const PAGE = 8;
const fold = (value: string) => value.toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

export function DetailView({ sections, analysisId, resultId }: { sections: Section[]; analysisId?: string; resultId?: string }) {
  const [query, setQuery] = useState("");
  const [opened, setOpened] = useState<Set<number>>(() => new Set());
  const [visible, setVisible] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);

  // Accent-insensitive index so "chuan hoa" also finds "Chuẩn hóa".
  const index = useMemo(() => sections.map(section => fold([section.title, section.summary ?? "", ...section.blocks.map(blockToPlainText)].join("\n"))), [sections]);
  const needle = fold(deferredQuery.trim());
  const matches = useMemo(() => sections.map((_, position) => position).filter(position => !needle || index[position].includes(needle)), [sections, index, needle]);
  const shown = needle ? matches : matches.slice(0, visible);

  const toggle = (position: number) => setOpened(current => {
    const next = new Set(current);
    if (next.has(position)) next.delete(position); else next.add(position);
    return next;
  });
  const allOpen = shown.length > 0 && shown.every(position => opened.has(position));

  function jump(position: number) {
    if (position >= visible) setVisible(position + 1);
    setOpened(current => new Set(current).add(position));
    window.requestAnimationFrame(() => document.getElementById(`section-${position}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <div className="detail-sections">
    <div className="panel detail-toolbar">
      <label className="detail-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm trong phân tích: thuật ngữ, tiêu đề, nội dung..." aria-label="Tìm trong phân tích chi tiết" />{query && <button onClick={() => setQuery("")} aria-label="Xóa tìm kiếm">×</button>}</label>
      <div className="detail-toolbar-row">
        <span>{needle ? `${matches.length} mục khớp “${deferredQuery.trim()}”` : `${sections.length} mục phân tích`}</span>
        <button className="text-button" disabled={!shown.length} onClick={() => setOpened(allOpen ? new Set() : new Set(shown))}>{allOpen ? "Thu gọn tất cả" : "Mở tất cả"}</button>
      </div>
      {sections.length > 3 && !needle && <nav className="detail-toc" aria-label="Mục lục phân tích">{sections.map((section, position) => <button key={position} onClick={() => jump(position)} title={section.title}><b>{String(position + 1).padStart(2, "0")}</b>{section.title}</button>)}</nav>}
    </div>

    {shown.map(position => {
      const section = sections[position];
      const isOpen = opened.has(position);
      return <article className={`panel detail-section ${isOpen ? "is-open" : ""}`} id={`section-${position}`} key={position}>
        <button type="button" className="detail-title" onClick={() => toggle(position)} aria-expanded={isOpen}>
          <span>{String(position + 1).padStart(2, "0")}</span>
          <div><h2>{section.title}</h2>{section.summary && <p>{section.summary}</p>}</div>
          <em>{isOpen ? "Thu gọn" : `${section.blocks.length} khối`} <i aria-hidden="true">⌄</i></em>
        </button>
        {isOpen && <div className="detail-body">{section.blocks.map((block, blockIndex) => <ResultBlockView block={block} analysisId={analysisId} resultId={resultId} key={`${block.type}-${blockIndex}`} />)}</div>}
      </article>;
    })}

    {needle && !matches.length && <div className="panel empty-state compact-empty"><h3>Không tìm thấy nội dung phù hợp</h3><p>Thử từ khóa ngắn hơn hoặc hỏi AI trong tab Hỏi đáp.</p></div>}
    {!needle && visible < sections.length && <button className="button button-secondary load-more" onClick={() => setVisible(count => count + PAGE)}>Xem thêm {Math.min(PAGE, sections.length - visible)} mục · {sections.length - visible} mục còn lại →</button>}
  </div>;
}
