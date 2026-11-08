// POST /api/decisao { sessionId, decisao } — a recrutadora decide pelo painel; o candidato recebe o feedback por e-mail.
// GET /api/decisao?sessionId=... — quem é o candidato e o que já foi decidido (o relatório mostra no fim).
// Protegida pela senha do painel (middleware). A primeira decisão vale: repetir devolve a já registrada.
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { candidatosPorSessao } from "@/lib/convites/store";
import { exemploHabilitado } from "@/lib/session/relatorio-exemplo";
import { gravacoesPendentesSquadMemory, hidratarSquadMemory } from "@/lib/squad-memory/store";
import { decidir, ensinarOTotti, lerDecisao, type DecisaoRegistrada } from "@/lib/vagas/decisao";

export const dynamic = "force-dynamic";

const SessionId = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);

/** Resposta do GET. `exemplo`: relatório de demonstração, a tela simula a decisão sem gravar nada. */
export interface SituacaoDaDecisao {
  candidato?: string;
  decisao?: DecisaoRegistrada;
  exemplo?: true;
}

/** Nome do candidato do relatório de exemplo (dados inventados, como o resto do exemplo). */
const CANDIDATO_EXEMPLO = "Rafael Moreira";

export async function GET(request: NextRequest) {
  const parsed = SessionId.safeParse(request.nextUrl.searchParams.get("sessionId"));
  if (!parsed.success) return NextResponse.json({ error: "sessionId inválido" }, { status: 400 });
  const sessionId = parsed.data;
  if (exemploHabilitado(sessionId)) {
    return NextResponse.json({ candidato: CANDIDATO_EXEMPLO, exemplo: true } satisfies SituacaoDaDecisao);
  }
  const [nomes, decisao] = await Promise.all([candidatosPorSessao(), lerDecisao(sessionId)]);
  return NextResponse.json({ candidato: nomes.get(sessionId), decisao } satisfies SituacaoDaDecisao);
}

const Body = z.object({
  sessionId: SessionId,
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
