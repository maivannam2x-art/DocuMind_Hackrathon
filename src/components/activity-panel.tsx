"use client";
import type { Activity } from "@/lib/activity";
export function ActivityPanel({ items }: { items: Activity[] }) {
  if (!items.length) return null;
  return (
    <details
      className="panel activity-panel"
      open={items.some((i) => i.status === "running")}
    >
      <summary>Nhật ký xử lý · AI và hệ thống nội bộ</summary>
      <ul>
        {items.map((i) => (
          <li key={i.id}>
            <strong>{i.actor === "ai" ? "AI" : "Hệ thống"}</strong>
            <span>
              {i.label}
              {i.model && <small>{i.model}</small>}
            </span>
            <em>
              {i.status === "running"
                ? Date.now() - Date.parse(i.created_at) > 300000
                  ? "Lượt đã gián đoạn · cần tiếp tục"
                  : "Đang xử lý"
                : i.status === "succeeded"
                  ? "Hoàn tất"
                  : "Chưa hoàn tất"}
            </em>
          </li>
        ))}
      </ul>
    </details>
  );
}
