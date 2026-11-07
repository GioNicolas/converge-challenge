import { NextResponse } from "next/server";
import { buscarConfig } from "@/lib/pre-entrevista/sessoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** InterviewConfig salvo: da memória ou de `data/configs/<id>.json`. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await buscarConfig(id);
  if (!config) return NextResponse.json({ erro: "config não encontrada" }, { status: 404 });
  return NextResponse.json(config);
}
