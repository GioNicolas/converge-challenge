import { NextRequest, NextResponse } from "next/server";
import { lastBlipDecision } from "@/lib/agents/policy";
import { toView } from "@/lib/session/store";
import { sessaoViva } from "@/lib/session/persistencia";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const session = await sessaoViva(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ...toView(session), blipDecision: lastBlipDecision(session) });
}
