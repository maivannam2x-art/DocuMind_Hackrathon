import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocuMind — Không gian học tập từ tài liệu",
  description: "Biến tài liệu thành tri thức có cấu trúc với DocuMind.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="vi"><body>{children}</body></html>;
}
