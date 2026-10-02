import { headers } from "next/headers";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "DocuMind — Không gian học tập từ tài liệu",
  description: "Biến tài liệu thành tri thức có cấu trúc với DocuMind.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers(); // Per-request render for the CSP nonce.
  return <html lang="vi"><body>{children}</body></html>;
}
