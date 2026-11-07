import { NextResponse } from "next/server";
import { findConfig, normalizarConfig } from "@/lib/config/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** O que a IDE precisa da vaga (duração, linguagens, questão). Notas e critérios da recrutadora ficam no servidor. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await findConfig(id);
  if (!found) return NextResponse.json({ error: "config não encontrada" }, { status: 404 });
  const config = normalizarConfig(found);
  return NextResponse.json({
    id: config.id,
    roleTitle: config.roleTitle,
    seniority: config.seniority,
    languages: config.languages,
    durationMin: config.durationMin,
    problemId: config.problemId,
    difficulty: config.difficulty,
  });
}
