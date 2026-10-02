import { enforceRateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";
import { getIdentity, setGuestCookie } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { runAnalysis } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const identity = await getIdentity(request);
    await enforceRateLimit(request, identity, "run");
    const { id } = await context.params;
    const result = await runAnalysis(identity, id);
    return setGuestCookie(ok(result), identity);
  } catch (error) { return errorResponse(error); }
}

