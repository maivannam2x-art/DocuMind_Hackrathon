"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseBrowserConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseBrowserConfig()) {
    throw new Error("Đăng nhập chưa được cấu hình. Hãy thêm URL và publishable key của Supabase vào môi trường triển khai.");
  }
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    browserClient = createClient(url, key, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  }
  return browserClient;
}

export async function getSupabaseAccessToken() {
  if (!hasSupabaseBrowserConfig()) return null;
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

