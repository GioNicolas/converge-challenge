import { NextResponse } from "next/server";
import { saveConfig } from "@/lib/config/store";
import { InterviewConfig } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recebe o `InterviewConfig` pronto (pré-entrevista) e guarda para as sessões usarem via `configId`. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = InterviewConfig.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    await saveConfig(parsed.data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "falha ao salvar" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: parsed.data.id });
}
