// Dependências das rotas (repositório, LLM, relógio). Em produção vêm do ambiente; os testes
// substituem com `definirContextoParaTestes`.
import { repositorioPadrao, type RepositorioSessoes } from "../armazenamento";
import { criarClienteOpenRouter, type LlmCliente } from "../llm/cliente";
import { criarLlmFalsoDeterministico } from "./llm-falso";

export type Contexto = {
  repositorio: RepositorioSessoes;
  /** null = sem LLM disponível (sem chave): as rotas respondem em silêncio. */
  llm: LlmCliente | null;
  agora: () => number;
  /** true = scorecard determinístico (AGENTE_FAKE=1), sem chamar o LLM. */
  fake: boolean;
};

let substituto: Partial<Contexto> | null = null;
let llmReal: LlmCliente | null | undefined;
let avisouSemChave = false;

export function definirContextoParaTestes(c: Partial<Contexto> | null): void {
  substituto = c;
}

function escolherLlm(): LlmCliente | null {
  if (process.env.AGENTE_FAKE === "1") return criarLlmFalsoDeterministico();
  if (llmReal === undefined) {
    llmReal = process.env.OPENROUTER_API_KEY ? criarClienteOpenRouter() : null;
  }
  if (llmReal === null && !avisouSemChave) {
    avisouSemChave = true;
    console.warn("[agente] OPENROUTER_API_KEY ausente (e AGENTE_FAKE != 1): as análises respondem sempre `ok`.");
  }
  return llmReal;
}

export function contexto(): Contexto {
  return {
    repositorio: substituto?.repositorio ?? repositorioPadrao(),
    llm: substituto && "llm" in substituto ? (substituto.llm ?? null) : escolherLlm(),
    agora: substituto?.agora ?? Date.now,
    fake: substituto?.fake ?? process.env.AGENTE_FAKE === "1",
  };
}
