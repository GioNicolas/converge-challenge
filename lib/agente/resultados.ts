// O resultado das entrevistas de System Design para o painel da vaga. Só servidor.
//
// As sessões do quadro ficam no repositório do cérebro, que o painel não lê. Para a lista da vaga não precisar
// de uma consulta por sessão, cada sessão aberta com um plano (vaga) ganha uma linha leve num índice
// (`quadro-indice` no kv), atualizada quando a entrevista acaba e quando o scorecard fica pronto.
import type { Kit } from "@/lib/agente/kits/tipos";
import type { Kv } from "@/lib/storage/kv";
import type { CartaoDoResultado, RecomendacaoDoResultado } from "@/lib/vagas/cartao";
import type { Scorecard } from "./scorecard";

const NS = "quadro-indice";

export type ResumoDoQuadro = {
  sessionId: string;
  /** A vaga (config) em que a sessão foi aberta: é por ela que o painel agrupa. */
  configId: string;
  roleTitle: string;
  startedAt: number;
  ended: boolean;
  state: "running" | "done" | "error";
  /** Média 1 a 4 do scorecard. */
  overallScore?: number;
  recommendation?: RecomendacaoDoResultado;
  cartao?: CartaoDoResultado;
};

export async function registrarNoIndice(kv: Kv, resumo: ResumoDoQuadro): Promise<void> {
  await kv.set(NS, resumo.sessionId, resumo);
}

/** Atualiza uma linha do índice. Sem linha (sessão sem vaga), não faz nada. */
export async function atualizarNoIndice(kv: Kv, sessionId: string, mudanca: Partial<ResumoDoQuadro>): Promise<void> {
  const atual = await kv.get<ResumoDoQuadro>(NS, sessionId);
  if (atual) await kv.set(NS, sessionId, { ...atual, ...mudanca });
}

export async function listarDoIndice(kv: Kv): Promise<ResumoDoQuadro[]> {
  return (await kv.list<ResumoDoQuadro>(NS)).map((l) => l.value);
}

const MAX_JUSTIFICATIVA = 420;
const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** O cartão do painel a partir do scorecard (nomes dos critérios vêm do kit). */
export function cartaoDoScorecard(sc: Scorecard, kit: Kit): CartaoDoResultado {
  return {
    resumo: sc.briefing_para_proxima_etapa,
    pontosFortes: sc.pontos_fortes,
    pontosFracos: sc.pontos_a_aprofundar,
    proximosPassos: [],
    criterios: sc.criterios.map((c) => ({
      nome: kit.criterios.find((k) => k.id === c.criterio)?.nome ?? c.criterio,
      nota: c.nota,
      justificativa: corta(c.justificativa, MAX_JUSTIFICATIVA),
    })),
  };
}
