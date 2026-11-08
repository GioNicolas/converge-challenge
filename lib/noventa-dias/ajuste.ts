/**
 * "O que o Totti ajustou com isso": a resposta dos 90 dias vira até 2 regras na memória da squad.
 *   1. O critério em que a entrevista errou vira uma regra fixa (sem IA):
 *      - não deu certo → a entrevista foi branda nele → "Penaliza …" (o Totti cobra mais);
 *      - deu certo → a entrevista foi dura nele → "Valoriza …" (o Totti dá mais crédito).
 *   2. O "o que surpreendeu" passa pelo extrator da F4 (guarda-corpo primeiro): pode virar mais uma regra técnica,
 *      e o que não é técnico (idade, vida pessoal…) é ignorado e avisado.
 */
import type { Report } from "@/lib/contracts";
import { criterioValido, nomeDoCriterio } from "@/lib/squad-memory/criterios";
import { chamarModeloPadrao, extrairRegras, MAX_REGRAS_POR_DECISAO, type ChamarModelo } from "@/lib/squad-memory/extrator";
import { motivoNaoTecnico } from "@/lib/squad-memory/guarda";
import { adicionarRegra, registrarMotivoIgnorado } from "@/lib/squad-memory/store";
import type { EfeitoRegra, OrigemRegra } from "@/lib/squad-memory/tipos";
import { MUDANCA } from "./mudanca";
import type { AjusteDoTotti, Contratacao } from "./tipos";

export { mudancaDaRegra } from "./mudanca";

const notaEmTexto = (nota: number | null | undefined) =>
  nota === null || nota === undefined ? "não teve nota" : `tirou ${String(nota).replace(".", ",")}`;

/** A regra do critério em que a entrevista errou. Sem critério conhecido: nenhuma. */
export function regraDoCriterio(
  c: Pick<Contratacao, "candidato" | "entrevista">,
  deuCerto: boolean,
  criterioId: string,
): { texto: string; efeito: EfeitoRegra; criterio: string } | undefined {
  if (!criterioValido(criterioId)) return undefined;
  const m = MUDANCA[criterioId];
  const nome = nomeDoCriterio(criterioId);
  const nota = c.entrevista.criterios.find((x) => x.id === criterioId)?.nota;
  const fato = `${c.candidato} ${notaEmTexto(nota)} em ${nome}`;
  return deuCerto
    ? {
        texto: `Valoriza ${m?.credito ?? nome.toLowerCase()}: ${fato} e deu certo aos 90 dias`,
        efeito: "valoriza",
        criterio: criterioId,
      }
    : {
        texto: `Penaliza ${m?.rigor ?? `${nome.toLowerCase()} fraco`}: ${fato} e falhou nisso aos 90 dias`,
        efeito: "penaliza",
        criterio: criterioId,
      };
}

/** O relatório da contratação no formato que o extrator da F4 lê. */
function comoReport(c: Contratacao) {
  const criteria: Report["criteria"] = c.entrevista.criterios.map((x) => ({
    id: x.id,
    name: x.nome,
    score: x.nota,
    evidence: [],
  }));
  return { recommendation: c.entrevista.recomendacao, overallScore: c.entrevista.nota, criteria };
}

export interface RespostaDoGestor {
  deuCerto: boolean;
  criterioErrado?: string;
  surpresa?: string;
}

/**
 * Guarda as regras e os trechos ignorados na memória da squad e devolve o ajuste. Nunca lança: se o extrator falhar,
 * fica só a regra do critério.
 */
export async function ajustarComResultado(
  c: Contratacao,
  resposta: RespostaDoGestor,
  /** null: sem modelo (só palavras-chave). */
  chamar: ChamarModelo | null = chamarModeloPadrao() ?? null,
): Promise<AjusteDoTotti> {
  const origem: OrigemRegra = {
    tipo: "resultado_90_dias",
    candidato: c.candidato,
    vagaId: c.vagaId,
    deuCerto: resposta.deuCerto,
  };
  const novas: { texto: string; efeito: EfeitoRegra; criterio: string }[] = [];

  const doCriterio = resposta.criterioErrado ? regraDoCriterio(c, resposta.deuCerto, resposta.criterioErrado) : undefined;
  // A regra fixa usa o nome do candidato: se um dia isso bater no guarda-corpo, não entra.
  if (doCriterio && !motivoNaoTecnico(doCriterio.texto)) novas.push(doCriterio);

  let ignorados: { trecho: string; porque: string }[] = [];
  const surpresa = resposta.surpresa?.trim();
  if (surpresa) {
    const extraido = await extrairRegras({ motivo: surpresa, origem, report: comoReport(c) }, chamar ?? undefined).catch(() => ({
      regras: [],
      ignorados: [],
    }));
    ignorados = extraido.ignorados;
    // Mais uma regra só se for de outro critério (a do critério errado já diz o principal).
    for (const r of extraido.regras) {
      if (novas.length >= MAX_REGRAS_POR_DECISAO) break;
      if (novas.some((n) => n.criterio === r.criterio)) continue;
      novas.push({ texto: r.texto, efeito: r.efeito, criterio: r.criterio });
    }
  }

  return {
    regras: novas.map((r) => adicionarRegra({ empresaId: c.empresaId, ...r, origem })),
    ignorados: ignorados.map((i) => registrarMotivoIgnorado({ empresaId: c.empresaId, ...i, origem })),
  };
}
