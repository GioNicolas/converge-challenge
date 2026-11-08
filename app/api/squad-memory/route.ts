// Memória Viva da Squad: o que o Totti aprendeu com o Tech Lead desta empresa (regras, ignorados e concordância).
import { NextResponse } from "next/server";
import { hidratarSquadMemory } from "@/lib/squad-memory/store";
import { visaoDaMemoria } from "@/lib/squad-memory/visao";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await hidratarSquadMemory();
  return NextResponse.json(visaoDaMemoria());
}
