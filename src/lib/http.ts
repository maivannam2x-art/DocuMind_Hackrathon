import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json({ data }, { status, headers });
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Lỗi máy chủ không xác định.";
  console.error("[DocuMind API]", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
}

export function parseJson<T>(value: unknown): T {
  if (typeof value !== "string") return value as T;
  try { return JSON.parse(value) as T; } catch { return value as T; }
}

