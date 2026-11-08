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
import type { EfeitoRegra, OrigemRegra, RegraSquad } from "@/lib/squad-memory/tipos";
import type { AjusteDoTotti, Contratacao } from "./tipos";

/**
 * Por critério: o que cobrar quando a entrevista foi branda (`rigor`) ou dar crédito quando foi dura (`credito`),
 * e o que muda na próxima entrevista, em uma frase.
 */
const MUDANCA: Record<string, { rigor: string; cobra: string; credito: string; valoriza: string }> = {
  abordagem: {
    rigor: "começar a codar sem explicar o plano",
    cobra: "pede o plano antes do código e cobra a justificativa",
    credito: "plano bem explicado, mesmo sem terminar o código",
    valoriza: "dá mais peso ao plano explicado do que ao código completo",
  },
  complexidade: {
    rigor: "complexidade dita sem justificar",
    cobra: "pede para justificar a complexidade apontando o código",
    credito: "quem melhora a solução depois de uma dica",
    valoriza: "conta como bom sinal chegar na solução melhor depois de uma dica",
  },
  corretude: {
    rigor: "código que só passa no exemplo",
    cobra: "só dá nota alta depois dos testes escondidos",
    credito: "solução simples e correta antes da otimizada",
    valoriza: "valoriza a solução correta antes da otimizada",
  },
  bordas: {
    rigor: "caso de borda só citado, sem teste",
    cobra: "pede para escrever o teste do caso de borda: não basta citar",
    credito: "quem testa casos de borda sem ninguém pedir",
    valoriza: "conta o teste de borda que ele escreve por conta própria",
  },
  comunicacao: {
    rigor: "explicação vaga do próprio código",
    cobra: "pede para explicar uma decisão do código com as palavras dele",
    credito: "quem explica bem mesmo travado",
    valoriza: "dá crédito à explicação clara mesmo quando o código trava",
  },
  pressao_adaptacao: {
    rigor: "travar na mudança sem pedir ajuda",
    cobra: "traz a mudança no meio mais cedo e observa a reação",
    credito: "quem se adapta rápido à mudança",
    valoriza: "dá mais peso à adaptação do que à primeira solução",
  },
  requisitos: {
    rigor: "desenhar sem perguntar os requisitos",
    cobra: "segura o desenho até ele perguntar escala e uso",
    credito: "quem fecha o escopo antes de desenhar",
    valoriza: "dá crédito a quem fecha o escopo antes de desenhar",
  },
  estimativa: {
    rigor: "escolher componente sem estimar o volume",
    cobra: "pede a conta de volume antes de aceitar o banco ou a fila",
    credito: "quem faz a conta de volume, mesmo aproximada",
    valoriza: "dá crédito à conta de volume, mesmo aproximada",
  },
  componentes: {
    rigor: "componentes sem o caminho dos dados",
    cobra: "pede o caminho de uma requisição de ponta a ponta",
    credito: "desenho simples com o fluxo claro",
    valoriza: "valoriza o desenho simples com o fluxo claro",
  },
  tradeoffs: {
    rigor: "escolha sem dizer o que perde",
    cobra: "pergunta o que ele perde com cada escolha",
    credito: "quem assume o que perde em cada escolha",
    valoriza: "dá crédito a quem assume o que perde em cada escolha",
  },
  gargalos_falhas: {
    rigor: "ignorar o que acontece quando um componente cai",
    cobra: "pergunta o que acontece quando um componente cai",
    credito: "quem pensa em falha sem ninguém perguntar",
    valoriza: "conta o plano de falha que ele traz sozinho",
  },
  uso_ia_criterio: {
    rigor: "aceitar a resposta da IA sem conferir",
    cobra: "pede para ele conferir o que a IA sugeriu",
    credito: "quem confere e corrige o que a IA sugere",
    valoriza: "dá crédito a quem confere o que a IA sugere",
  },
};

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
    ? { texto: `Valoriza ${m?.credito ?? nome.toLowerCase()}: ${fato} e deu certo aos 90 dias`, efeito: "valoriza", criterio: criterioId }
    : { texto: `Penaliza ${m?.rigor ?? `${nome.toLowerCase()} fraco`}: ${fato} e falhou nisso aos 90 dias`, efeito: "penaliza", criterio: criterioId };
}

/** O que muda na próxima entrevista com esta regra, para a tela: "Casos de borda · mais rigor" + a frase. */
export function mudancaDaRegra(r: Pick<RegraSquad, "criterio" | "efeito">): { criterio: string; manchete: string; naEntrevista: string } {
  const m = MUDANCA[r.criterio];
  const criterio = nomeDoCriterio(r.criterio);
  return r.efeito === "penaliza"
    ? { criterio, manchete: "mais rigor", naEntrevista: m?.cobra ?? `cobra mais ${criterio.toLowerCase()}` }
    : { criterio, manchete: "mais crédito", naEntrevista: m?.valoriza ?? `dá mais crédito a ${criterio.toLowerCase()}` };
}

/** O relatório da contratação no formato que o extrator da F4 lê. */
function comoReport(c: Contratacao) {
  const criteria: Report["criteria"] = c.entrevista.criterios.map((x) => ({ id: x.id, name: x.nome, score: x.nota, evidence: [] }));
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
  const origem: OrigemRegra = { tipo: "resultado_90_dias", candidato: c.candidato, vagaId: c.vagaId, deuCerto: resposta.deuCerto };
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
