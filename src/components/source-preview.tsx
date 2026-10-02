"use client";
import { useMemo, useState } from "react";
import { sourceContentBlocks } from "@/lib/source-content";
import { ResultBlockView } from "@/components/result-block";

export function SourcePreview({ text, headings = [] }: { text: string; headings?: string[] }) {
  const [visible, setVisible] = useState(60);
  const blocks = useMemo(() => sourceContentBlocks(text, headings), [text, headings]);
  return <div className="source-reading-view">{blocks.slice(0, visible).map((block, index) => block.heading
    ? <h4 className="source-heading" key={index}>{String(block.content)}</h4>
    : <ResultBlockView key={index} block={block} expandDiagram={index < 8} />)}
    {!blocks.length && <p>Không có nội dung học tập để hiển thị.</p>}
    {blocks.length > visible && <button type="button" className="button button-secondary" onClick={() => setVisible(count => count + 60)}>Xem thêm nội dung ({blocks.length - visible} đoạn)</button>}
  </div>;
}
