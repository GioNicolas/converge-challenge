// Apoio dos testes da conversa: uma sessão já aberta, sem modelo e sem Jev.
import type { Classificacao } from "../classificador";
import type { ResultadoCompetencias } from "../competencias";
import type { Cobertura, EnfaseFala, NivelDito } from "../cobertura";
import type { NivelEnfase } from "../enfase";
import type { ChatOpcoes, ChatResposta, Mensagem } from "../llm";
import type { DepsDoTurno } from "../turno";
import type { FocusArea } from "@/lib/contracts";
import type { Turno } from "../rascunho";
import { criarSessao, type Sessao } from "../sessoes";
import { aplicarPasso } from "../planejador";
import { abrirConversa } from "../turno";

export const CLASSIFICACAO: Classificacao = {
  mode: { value: "live_coding", confidence: 0.95, probabilities: { live_coding: 0.95, system_design: 0.05 } },
  seniority: { value: "pleno", confidence: 0.9, probabilities: { junior: 0.05, pleno: 0.9, senior: 0.05 } },
  focusScores: [],
  focus: [{ area: "tecnico", weight: 1 }],
  nivelExplicito: 0.9,
  confirmar: [],
  usage: { inputTokens: null, ms: 0 },
  request: { state: null, questions: null },
  answers: null,
  model: "teste",
};
export const VAGA = { roleTitle: "Backend Pleno", jobDescription: "APIs em Node e Postgres." };
export const COMPETENCIAS: ResultadoCompetencias = { competencias: [], ms: 0, mensagens: [], tentativas: [] };

/**
 * Sessão recém-aberta: só a abertura sem modelo, que não propõe formato, nível nem foco (issue #127). O primeiro passo
 * depois da primeira fala dela é a proposta (`confirmar_inicio`), a pergunta de nível ou a oferta de troca.
 */
export function sessaoRecemAberta(falas: Turno[] = [], classificacao: Classificacao = CLASSIFICACAO): Sessao {
  const sessao = criarSessao(VAGA, classificacao, Date.now(), COMPETENCIAS);
  abrirConversa(sessao);
  sessao.transcricao.push(...falas);
  return sessao;
}

/**
 * Sessão aberta e com a proposta do início já feita (`confirmar_inicio` contado): o ponto de partida dos testes das
 * etapas seguintes da conversa. A abertura é a mesma de `sessaoRecemAberta`.
 */
export function sessaoAberta(falas: Turno[] = [], classificacao: Classificacao = CLASSIFICACAO): Sessao {
  const sessao = sessaoRecemAberta([], classificacao);
  sessao.plano = aplicarPasso(sessao.plano, { tipo: "confirmar_inicio" });
  sessao.transcricao.push(...falas);
  return sessao;
}

export const totti = (text: string): Turno => ({ role: "agente", text });
export const ela = (text: string): Turno => ({ role: "recrutadora", text });

/** LLM falso: devolve as respostas na ordem, uma por chamada (a última vale para as chamadas seguintes). */
export function chatFalso(...respostas: string[]) {
  const chamadas: Mensagem[][] = [];
  const chat = async ({ messages }: ChatOpcoes): Promise<ChatResposta> => {
    chamadas.push(messages);
    const content = respostas[Math.min(chamadas.length - 1, respostas.length - 1)];
    return { content, ms: 1, provedor: "featherless", model: "falso", tentativas: [{ provedor: "featherless", model: "falso", ms: 1 }] };
  };
  return { chat, chamadas };
}

/** A saída do modelo no formato pedido pelo prompt. */
export const saida = (fala: string, movimento?: string) => JSON.stringify(movimento ? { fala, movimento } : { fala });

/** O que o Jev falso diz de uma fala dela: sinais do turno, cobertura a somar, nível dito e ênfase por área. */
export interface LeituraFalsa {
  sinais?: Record<string, number>;
  cobertura?: Record<string, number>;
  nivelDito?: NivelDito;
  niveis?: Partial<Record<FocusArea, NivelEnfase>>;
}

/** Jev falso: uma leitura por fala dela, na ordem. Sem leitura para a fala, ela não diz nada (todos os sinais em zero). */
export function jevFalso(...leituras: LeituraFalsa[]): Pick<DepsDoTurno, "avaliarCobertura" | "avaliarEnfaseDaFala"> {
  let turno = -1;
  const chamada = { request: { state: null, questions: null }, answers: {}, model: "jev-falso" };
  return {
    avaliarCobertura: async (r): Promise<Cobertura> => {
      turno += 1;
      const leitura = leituras[turno] ?? {};
      return {
        ...chamada,
        cobertura: { ...r.cobertura, ...leitura.cobertura },
        nivelDito: leitura.nivelDito ?? "nao_disse",
        sinais: leitura.sinais ?? {},
        faltando: [],
        ms: 0,
        usage: { input_tokens: null, output_tokens: null },
      };
    },
    avaliarEnfaseDaFala: async (): Promise<EnfaseFala> => ({ ...chamada, niveis: leituras[turno]?.niveis ?? {}, ms: 0 }),
  };
}

/**
 * Sessão aberta com a decisão que antes a abertura já pedia, para os testes de decisão pendente: a oferta de troca (IA
 * aplicada pesa mais e live coding não a mede) ou a pergunta de nível (a vaga não diz o nível). No fluxo real, essas
 * perguntas vêm no passo seguinte à abertura (`oferecer_tradeoff`, `perguntar_nivel`).
 */
export function sessaoComDecisaoAberta(falas: Turno[] = [], classificacao: Classificacao = CLASSIFICACAO): Sessao {
  const sessao = sessaoAberta([], classificacao);
  const maiorPeso = [...sessao.rascunho.focus].sort((a, b) => b.weight - a.weight)[0]?.area;
  if (maiorPeso === "uso_ia" && sessao.rascunho.mode === "live_coding") {
    const oferta = { tipo: "oferecer_tradeoff", area: "uso_ia", modoAlternativo: "system_design" } as const;
    sessao.transcricao.push(
      totti("Live coding não mede se a pessoa sabe construir com IA; se isso for central, system design avalia melhor. O que prefere?"),
    );
    sessao.plano = aplicarPasso(sessao.plano, oferta);
  } else if (classificacao.confirmar.includes("seniority")) {
    sessao.transcricao.push(totti("O nível não está claro na vaga: é júnior, pleno ou sênior?"));
  }
  sessao.transcricao.push(...falas);
  return sessao;
}
