import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: { service: "documind-api", status: "ok", llmProvider: process.env.LLM_PROVIDER ?? "mock" } });
}

