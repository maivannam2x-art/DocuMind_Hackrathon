"use client";
import type { KeyboardEvent } from "react";
const tabs = [
  ["overview", "Tổng quan"],
  ["summary", "Tóm tắt"],
  ["detail", "Phân tích chi tiết"],
  ["conclusion", "Kết luận"],
  ["quiz", "Quiz"],
  ["chat", "Hỏi đáp AI"],
  ["report", "Xuất báo cáo"],
];
export function ResultTabs({
  active,
  onSelect,
  quizEnabled,
  quizCount,
  variant = "sidebar",
}: {
  active: string;
  onSelect: (id: string) => void;
  quizEnabled: boolean;
  quizCount: number;
  variant?: "sidebar" | "mobile";
}) {
  const visible = tabs.filter(([id]) => id !== "quiz" || quizEnabled);
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const i = visible.findIndex(([id]) => id === active);
    let next = i;
    if (["ArrowDown", "ArrowRight"].includes(event.key))
      next = (i + 1) % visible.length;
    else if (["ArrowUp", "ArrowLeft"].includes(event.key))
      next = (i + visible.length - 1) % visible.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visible.length - 1;
    else return;
    event.preventDefault();
    onSelect(visible[next][0]);
    event.currentTarget
      .querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }
  return (
    <div
      className={variant === "mobile" ? "result-tabs" : "nav-submenu"}
      role="tablist"
      aria-label="Nội dung kết quả"
      aria-orientation={variant === "mobile" ? "horizontal" : "vertical"}
      onKeyDown={move}
    >
      {visible.map(([id, label]) => (
        <button
          key={id}
          id={`${variant === "mobile" ? "mobile-" : ""}result-tab-${id}`}
          role="tab"
          aria-selected={active === id}
          aria-controls="result-content"
          tabIndex={active === id ? 0 : -1}
          className={
            active === id ? (variant === "mobile" ? "active" : "selected") : ""
          }
          onClick={() => onSelect(id)}
        >
          {label}
          {id === "quiz" && quizCount > 0 ? ` (${quizCount})` : ""}
        </button>
      ))}
    </div>
  );
}
