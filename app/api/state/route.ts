import { NextRequest, NextResponse } from "next/server";
import { getSession, toView } from "@/lib/session/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "sessão não encontrada" }, { status: 404 });
  }
  return NextResponse.json(toView(session));
}
