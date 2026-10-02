import { NextRequest, NextResponse } from "next/server";
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origin = supabase ? new URL(supabase).origin : "";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${origin} ${origin.replace("https:", "wss:")}`,
    `img-src 'self' data: blob: ${origin}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    `frame-src 'self' ${origin}`,
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
export const config = { matcher: ["/", "/auth/:path*"] };
