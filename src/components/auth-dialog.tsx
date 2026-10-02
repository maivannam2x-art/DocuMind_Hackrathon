"use client";

import { FormEvent, useEffect, useState } from "react";
import { validateProfile, validateSignUp } from "@/lib/auth-validation";
import { getSupabaseAccessToken, getSupabaseBrowserClient, hasSupabaseBrowserConfig } from "@/lib/supabase-browser";

type AuthMode = "sign-in" | "sign-up" | "profile";
type Profile = { email: string; displayName: string; username: string; avatarUrl: string | null };

function errorText(message: string) {
  if (/invalid login credentials/i.test(message)) return "Email hoặc mật khẩu chưa chính xác.";
  if (/user already registered/i.test(message)) return "Email này đã có tài khoản. Hãy đăng nhập.";
  if (/email not confirmed/i.test(message)) return "Tài khoản cũ chưa được kích hoạt. Hãy liên hệ người quản trị để hỗ trợ.";
  if (/rate limit|too many requests/i.test(message)) return "Bạn thao tác quá nhanh. Hãy chờ một chút rồi thử lại.";
  if (/password should be at least/i.test(message)) return "Mật khẩu cần có ít nhất 8 ký tự.";
  return message;
}

async function requestProfile(method: "GET" | "PATCH", body?: unknown) {
  const token = await getSupabaseAccessToken();
  if (!token) throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.");
  const response = await fetch("/api/profile", {
    method,
    credentials: "include",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({})) as { data?: Profile; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "Không thể tải hồ sơ tài khoản.");
  return payload.data;
}

export function AuthDialog({ initialMode, email, onClose, onAuthenticated }: {
  initialMode: AuthMode;
  email?: string;
  onClose: () => void;
  onAuthenticated: (profile?: Pick<Profile, "displayName">) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [formEmail, setFormEmail] = useState(email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const configured = hasSupabaseBrowserConfig();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    document.body.classList.add("dialog-open");
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("dialog-open");
    };
  }, [busy, onClose]);

  useEffect(() => {
    if (mode !== "profile") return;
    let current = true;
    setBusy(true);
    requestProfile("GET").then(profile => {
      if (!current || !profile) return;
      setFormEmail(profile.email);
      setDisplayName(profile.displayName);
      setUsername(profile.username);
    }).catch(cause => {
      if (current) setError(cause instanceof Error ? cause.message : "Không tải được hồ sơ.");
    }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [mode]);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!configured) {
      setError("Đăng nhập chưa được cấu hình trên môi trường này.");
      return;
    }
    if (mode === "sign-up") {
      const validation = validateSignUp({ displayName, email: formEmail, password, passwordConfirmation });
      if (validation) { setError(validation); return; }
    }
    if (mode === "profile") {
      const validation = validateProfile(displayName, username);
      if (validation) { setError(validation); return; }
    }

    setBusy(true);
    try {
      const client = getSupabaseBrowserClient();
      if (mode === "sign-in") {
        const { error: authError } = await client.auth.signInWithPassword({ email: formEmail.trim(), password });
        if (authError) throw new Error(errorText(authError.message));
        onAuthenticated();
        onClose();
      } else if (mode === "sign-up") {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: displayName.trim(), email: formEmail.trim(), password, passwordConfirmation }),
        });
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message ?? "Không thể tạo tài khoản.");
        const { error: authError } = await client.auth.signInWithPassword({ email: formEmail.trim(), password });
        if (authError) throw new Error(errorText(authError.message));
        onAuthenticated();
        onClose();
      } else {
        const profile = await requestProfile("PATCH", { displayName: displayName.trim(), username: username.trim() });
        if (profile) {
          setDisplayName(profile.displayName);
          setUsername(profile.username);
        }
        setMessage("Đã lưu hồ sơ của bạn.");
        onAuthenticated({ displayName: profile?.displayName ?? displayName.trim() });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể hoàn tất yêu cầu.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setError("");
    setBusy(true);
    try {
      const { error: authError } = await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
      if (authError) throw new Error(errorText(authError.message));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đăng xuất.");
    } finally { setBusy(false); }
  }

  const heading = mode === "sign-up" ? "Tạo tài khoản DocuMind" : mode === "profile" ? "Hồ sơ cá nhân" : "Chào mừng bạn trở lại";
  const subheading = mode === "sign-up" ? "Lưu lại tài liệu, kết quả và lịch sử học tập của bạn." : mode === "profile" ? "Quản lý thông tin tài khoản và không gian học tập." : "Đăng nhập để tiếp tục học từ các tài liệu đã lưu.";

  return <div className="auth-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" type="button" onClick={onClose} aria-label="Đóng cửa sổ">×</button>
      <div className="auth-brand"><span className="brand-mark">D</span><span>DocuMind</span></div>
      <div className="auth-heading"><h2 id="auth-title">{heading}</h2><p>{subheading}</p></div>
      {!configured && <div className="auth-alert" role="alert">Thiếu URL hoặc publishable key Supabase trên môi trường triển khai.</div>}
      {error && <div className="auth-alert" role="alert">{error}</div>}
      {message && <div className="auth-success" role="status">{message}</div>}

      <form className="auth-form" onSubmit={event => void submit(event)}>
        {mode === "sign-up" && <label className="auth-field"><span>Tên hiển thị</span><input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} required placeholder="Tên của bạn" /></label>}
        {mode === "profile" && <label className="auth-field"><span>Email</span><input type="email" value={formEmail} readOnly /></label>}
        {mode === "profile" && <label className="auth-field"><span>Tên hiển thị</span><input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} required /></label>}
        {mode === "profile" && <label className="auth-field"><span>Tên người dùng <small>Tùy chọn</small></span><input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} maxLength={24} placeholder="vd: mai_nam" /></label>}
        {mode !== "profile" && <label className="auth-field"><span>Email</span><input type="email" autoComplete="email" value={formEmail} onChange={event => setFormEmail(event.target.value)} required placeholder="ban@example.com" /></label>}
        {mode !== "profile" && <label className="auth-field"><span>Mật khẩu</span><input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={72} required placeholder={mode === "sign-up" ? "Ít nhất 8 ký tự" : "Nhập mật khẩu"} /></label>}
        {mode === "sign-up" && <label className="auth-field"><span>Nhập lại mật khẩu</span><input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} minLength={8} maxLength={72} required placeholder="Nhập lại mật khẩu" /></label>}
        <button className="auth-submit" type="submit" disabled={busy || !configured}>{busy ? "Đang xử lý…" : mode === "sign-up" ? "Tạo tài khoản" : mode === "profile" ? "Lưu hồ sơ" : "Đăng nhập"}</button>
      </form>
      {mode === "profile" ? <div className="auth-bottom"><button type="button" className="auth-text-button auth-signout" onClick={() => void signOut()} disabled={busy}>Đăng xuất khỏi tài khoản</button><button type="button" className="auth-text-button" onClick={onClose}>Đóng</button></div> : <div className="auth-bottom"><span>{mode === "sign-up" ? "Đã có tài khoản?" : "Chưa có tài khoản?"}</span><button type="button" className="auth-text-button" onClick={() => switchMode(mode === "sign-up" ? "sign-in" : "sign-up")}>{mode === "sign-up" ? "Đăng nhập" : "Đăng ký"}</button></div>}
      {mode !== "profile" && <p className="auth-footnote">Đăng ký đồng nghĩa với việc bạn sử dụng DocuMind theo đúng mục đích học tập. Dữ liệu phiên khách không được lưu vào lịch sử tài khoản.</p>}
    </section>
  </div>;
}
