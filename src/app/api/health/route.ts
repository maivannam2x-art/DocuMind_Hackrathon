import {INPUT_LIMITS} from "@/lib/limits";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ data: { service: "documind-api", status: "ok", inputLimits:INPUT_LIMITS, llmProvider: process.env.LLM_PROVIDER ?? "mock" } });
}

