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

const MAX_PONTOS_FRACOS = 3;

/** O cartão do painel a partir do scorecard (nomes dos critérios vêm do kit). Só usa o briefing para a próxima etapa. */
export function cartaoDoScorecard(sc: Scorecard, kit: Kit): CartaoDoResultado {
  const criterios = sc.criterios.map((c) => ({
    nome: kit.criterios.find((k) => k.id === c.criterio)?.nome ?? c.criterio,
    nota: c.nota,
    justificativa: corta(c.justificativa, MAX_JUSTIFICATIVA),
  }));
  // Com nota: o mais fraco primeiro. Sem nota não entra em nada disto.
  const avaliados = sc.criterios.filter((c) => c.nota !== null).sort((a, b) => a.nota! - b.nota!);
  // Scorecard antigo: os "pontos a aprofundar" são temas, não o que aconteceu. Usa a justificativa dos critérios fracos.
  const comResumoNovo = Boolean(sc.resumo_da_entrevista?.trim() || sc.resumo_da_solucao?.trim());
  const fracosPelaNota = avaliados.filter((c) => c.nota! <= 2).slice(0, MAX_PONTOS_FRACOS).map((c) => corta(c.justificativa, MAX_JUSTIFICATIVA));
  const pontosFracos = comResumoNovo && sc.pontos_a_aprofundar.length > 0 ? sc.pontos_a_aprofundar : fracosPelaNota;
  // Sem resumo escrito, a justificativa do critério mais fraco; nunca o briefing da próxima etapa.
  const resumo = sc.resumo_da_entrevista?.trim() || (avaliados[0] ? corta(avaliados[0].justificativa, MAX_JUSTIFICATIVA) : "");
  const proximoPasso = sc.briefing_para_proxima_etapa.trim();
  return {
    resumo,
    solucao: sc.resumo_da_solucao?.trim() ?? "",
    pontosFortes: sc.pontos_fortes,
    pontosFracos,
    proximosPassos: proximoPasso ? [proximoPasso] : [],
    criterios,
  };
}
