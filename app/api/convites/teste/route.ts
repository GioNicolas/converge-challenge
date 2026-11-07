import { NextResponse } from "next/server";
import { candidatosTeste } from "@/lib/convites/teste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Candidatos de teste do time (CANDIDATOS_TESTE), pra UI montar a lista de inscritos. */
export async function GET() {
  return NextResponse.json({ candidatos: candidatosTeste() });
}
