// Ciclo dos 90 dias: as contratações (de uma vaga, com ?vagaId=) e o indicador da garantia.
import { NextResponse } from "next/server";
import { visaoDasContratacoes } from "@/lib/noventa-dias/visao";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(req: Request) {
  const vagaId = new URL(req.url).searchParams.get("vagaId") ?? undefined;
  return NextResponse.json(visaoDasContratacoes(vagaId));
}
