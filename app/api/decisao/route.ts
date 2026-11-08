// POST /api/decisao { sessionId, decisao } — a recrutadora decide pelo painel; o candidato recebe o feedback por e-mail.
// Protegida pela senha do painel (middleware). A primeira decisão vale: repetir devolve a já registrada.
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { gravacoesPendentesSquadMemory, hidratarSquadMemory } from "@/lib/squad-memory/store";
import { decidir, ensinarOTotti } from "@/lib/vagas/decisao";

export const dynamic = "force-dynamic";

const Body = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  decisao: z.enum(["avancar", "nao_avancar"]),
  motivo: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  await hidratarSquadMemory();
  const { sessionId, decisao, motivo } = parsed.data;
  const { registro, jaDecidida } = await decidir(sessionId, decisao);
  // O Totti aprende com a decisão depois da resposta (o extrator do motivo chama o LLM e a recrutadora não espera).
  if (!jaDecidida) {
    const aprender = async () => {
      await ensinarOTotti(sessionId, decisao, motivo);
      await gravacoesPendentesSquadMemory();
    };
    try {
      after(aprender);
    } catch {
      void aprender(); // fora de uma requisição do Next (testes): roda solto
    }
  }
  return NextResponse.json({ ...registro, jaDecidida });
}
