// O cartão do painel a partir do relatório do Live Coding. Só servidor.
import type { Report } from "@/lib/contracts";
import type { CartaoDoResultado } from "@/lib/vagas/cartao";

const MAX_JUSTIFICATIVA = 420;
const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

export function cartaoDoRelatorio(r: Report): CartaoDoResultado {
  return {
    resumo: r.summary,
    pontosFortes: r.strengths,
    pontosFracos: r.concerns,
    proximosPassos: r.nextSteps,
    criterios: r.criteria.map((c) => ({
      nome: c.name,
      nota: c.score,
      // A justificativa do Live Coding são as evidências citadas: as duas primeiras bastam para o cartão.
      justificativa: corta(c.evidence.slice(0, 2).map((e) => e.text.trim()).filter(Boolean).join(" "), MAX_JUSTIFICATIVA),
    })),
  };
}
