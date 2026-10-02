"use client";
import { useEffect, useState } from "react";
import { api } from "@/hooks/use-workspace";
type Metrics = {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  truncated: boolean;
};
export function UsageMetrics({ analysisId }: { analysisId: string | null }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (analysisId)
      void api<Metrics>(`/api/analyses/${analysisId}/metrics`)
        .then((value) => {
          if (active) setMetrics(value);
        })
        .catch(() => {
          if (active) setError("Chưa tải được thống kê AI.");
        });
    return () => {
      active = false;
    };
  }, [analysisId]);
  return (
    <details className="panel usage-metrics">
      <summary>Thông tin xử lý AI</summary>
      {metrics ? (
        <p>
          {metrics.calls} lượt gọi · {metrics.failedCalls} lượt lỗi ·{" "}
          {metrics.inputTokens.toLocaleString("vi-VN")} token đầu vào ·{" "}
          {metrics.outputTokens.toLocaleString("vi-VN")} token đầu ra ·{" "}
          {(metrics.latencyMs / 1000).toFixed(1)} giây tổng thời gian gọi
          {metrics.truncated ? " · Số liệu giới hạn 2.000 lượt" : ""}. Chi phí
          tiền chưa tính vì phụ thuộc bảng giá và gói API.
        </p>
      ) : (
        <p>{error || "Đang tải thống kê..."}</p>
      )}
    </details>
  );
}
