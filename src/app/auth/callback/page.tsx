"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase-browser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function completeSignIn() {
      const code = new URLSearchParams(window.location.search).get("code");
      if (!hasSupabaseBrowserConfig() || !code) {
        if (active) setError("Liên kết xác nhận không hợp lệ hoặc đã hết hạn. Hãy đăng nhập hoặc đăng ký lại.");
        return;
      }
      const { error: exchangeError } = await getSupabaseBrowserClient().auth.exchangeCodeForSession(code);
      if (!active) return;
      if (exchangeError) setError("Không thể xác nhận email. Hãy mở lại liên kết mới nhất trong email của bạn.");
      else router.replace("/");
    }
    void completeSignIn();
    return () => { active = false; };
  }, [router]);

  return <main className="auth-route"><section className="auth-route-card"><div className="auth-brand"><span className="brand-mark">D</span><span>DocuMind</span></div><h1>{error ? "Chưa thể xác nhận email" : "Đang xác nhận tài khoản…"}</h1><p>{error || "Chúng tôi đang hoàn tất đăng nhập an toàn cho bạn."}</p>{error && <Link href="/">Quay lại DocuMind</Link>}</section></main>;
}
