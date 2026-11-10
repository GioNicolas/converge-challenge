// Apoio dos testes da conversa: uma sessão já aberta, sem modelo e sem Jev.
import type { Classificacao } from "../classificador";
import type { ResultadoCompetencias } from "../competencias";
import type { Turno } from "../rascunho";
import { criarSessao, type Sessao } from "../sessoes";
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

/** Sessão já aberta (a abertura sai sem modelo), com as falas seguintes acrescentadas à transcrição. */
export function sessaoAberta(falas: Turno[] = [], classificacao: Classificacao = CLASSIFICACAO): Sessao {
  const sessao = criarSessao(VAGA, classificacao, Date.now(), COMPETENCIAS);
  abrirConversa(sessao);
  sessao.transcricao.push(...falas);
  return sessao;
}

export const totti = (text: string): Turno => ({ role: "agente", text });
export const ela = (text: string): Turno => ({ role: "recrutadora", text });
