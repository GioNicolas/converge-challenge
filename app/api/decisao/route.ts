// POST /api/decisao { sessionId, decisao } — a recrutadora decide pelo painel; o candidato recebe o feedback por e-mail.
// Protegida pela senha do painel (middleware). A primeira decisão vale: repetir devolve a já registrada.
import { NextResponse } from "next/server";
import { z } from "zod";
import { decidir } from "@/lib/vagas/decisao";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  decisao: z.enum(["avancar", "nao_avancar"]),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  const { registro, jaDecidida } = await decidir(parsed.data.sessionId, parsed.data.decisao);
  return NextResponse.json({ ...registro, jaDecidida });
}
