import type { ReactNode } from "react";
const paths: Record<string, string> = {
  "＋": "M12 5v14M5 12h14",
  "↓": "M12 3v13M6 10l6 6 6-6M4 20h16",
  "▦": "M5 3h14v18H5zM8 7h8M8 11h8M8 15h5",
  "▤": "M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h6",
  "✦": "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  "↗": "M5 19 19 5M5 5h14v14",
  "✓": "m5 12 4 4L19 6",
  "☷": "M5 6h14M5 12h14M5 18h14",
};
export function AppIcon({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[String(children)] ?? paths["✦"]} />
    </svg>
  );
}
