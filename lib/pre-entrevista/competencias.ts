/**
 * Competências-chave da vaga (tecnologias e conhecimentos específicos) e se cada formato consegue verificá-las.
 *
 * Uma chamada rápida de LLM, feita ao criar a sessão. Não vira pergunta: serve só para dizer, no fim, o que a
 * entrevista não avaliou (ver `atualizarNaoAvaliado` em `turno.ts`). Se a chamada falhar ou a resposta não for
 * válida, segue sem nenhuma competência, e o log registra o motivo.
 */
import { z } from "zod";
import type { InterviewMode } from "@/lib/contracts";
import type { Vaga } from "./classificador";
import { chat, ErroChat, type Alvo, type Mensagem, type Tentativa } from "./llm";

export const MAX_COMPETENCIAS = 5;

export interface Competencia {
  nome: string;
  /** Se o formato consegue verificar a competência (por modo). */
  verificavel: Record<InterviewMode, boolean>;
}

export interface ResultadoCompetencias {
  competencias: Competencia[];
  ms: number;
  provedor?: string;
  model?: string;
  /** Mensagens enviadas ao modelo, para o log. */
  mensagens: Mensagem[];
  /** Resposta crua do modelo, se chegou a responder. */
  respostaCrua?: string;
  /** Motivo de não ter extraído nada (falha da chamada ou resposta inválida). */
  erro?: string;
  tentativas: Tentativa[];
}

/** OpenRouter primeiro (8 s), depois Featherless (10 s). Qualquer falha segue sem competências. */
const ALVOS: Alvo[] = [
  { provedor: "openrouter", model: "google/gemini-2.5-flash-lite", timeoutMs: 8_000 },
  { provedor: "featherless", model: "google/gemma-4-26B-A4B-it", timeoutMs: 10_000 },
];

const Competencias = z.array(
  z.object({
    nome: z.string().trim().min(1).max(60),
    tipo: z.enum(["linguagem", "tecnologia", "conhecimento"]),
    verificavel: z.object({ live_coding: z.boolean(), system_design: z.boolean() }),
  }),
);

/**
 * Rede de segurança: linguagens de programação comuns. Linguagem não vai para "não avaliado": no live coding o
 * candidato escolhe a linguagem na IDE, e em system design linguagem não importa.
 */
const LINGUAGENS_COMUNS = new Set([
  "python",
  "typescript",
  "javascript",
  "go",
  "golang",
  "kotlin",
  "java",
  "c++",
  "cpp",
  "c#",
  "csharp",
  "rust",
  "ruby",
  "php",
  "swift",
  "scala",
  "dart",
  "elixir",
]);

const ehLinguagem = (c: { nome: string; tipo: string }) =>
  c.tipo === "linguagem" || LINGUAGENS_COMUNS.has(c.nome.toLowerCase().replace(/\s+/g, ""));

const PROMPT_SISTEMA = `Você lista, de uma vaga de tecnologia, até ${MAX_COMPETENCIAS} competências-chave: tecnologias ou conhecimentos específicos que a vaga exige (ex.: Kafka, React, Kubernetes, RAG, Python). Não liste habilidades gerais (comunicação, liderança) nem áreas genéricas (engenharia de IA).
Para cada uma, diga o tipo: "linguagem" (Python, Go, TypeScript), "tecnologia" (Kafka, React, PostgreSQL, Kubernetes) ou "conhecimento" (RAG, sagas, idempotência).

Para cada competência, diga se cada formato consegue verificá-la:
- live_coding: um problema de algoritmo numa IDE. Verifica linguagens e código (Python, TypeScript, React, SQL ao escrever uma consulta). Não verifica ferramentas de infraestrutura nem de IA (Kafka, Kubernetes, RAG: não).
- system_design: desenhar a arquitetura num quadro. Verifica tecnologias de infraestrutura, dados e arquitetura (Kafka, Redis, PostgreSQL, Kubernetes, RAG como parte do desenho). Não verifica sintaxe nem frameworks de interface (React, Python: não).

Responda só com JSON, sem texto antes ou depois, sem cercas de código:
[{"nome": "Kafka", "tipo": "tecnologia", "verificavel": {"live_coding": false, "system_design": true}}]`;

/** Pega a lista JSON da resposta, tirando cercas de código e texto em volta. */
function extrairLista(texto: string): unknown {
  const semCerca = texto.replace(/```(?:json)?/gi, "");
  const inicio = semCerca.indexOf("[");
  const fim = semCerca.lastIndexOf("]");
  if (inicio === -1 || fim <= inicio) throw new Error(`nenhuma lista JSON na resposta: ${texto.slice(0, 200)}`);
  return JSON.parse(semCerca.slice(inicio, fim + 1));
}

export async function extrairCompetencias(vaga: Vaga): Promise<ResultadoCompetencias> {
  const mensagens: Mensagem[] = [
    { role: "system", content: PROMPT_SISTEMA },
    { role: "user", content: `CARGO: ${vaga.roleTitle}\n\nVAGA:\n${vaga.jobDescription}` },
  ];

  let resposta: Awaited<ReturnType<typeof chat>>;
  try {
    resposta = await chat({ alvos: ALVOS, messages: mensagens, temperature: 0, maxTokens: 800 });
  } catch (err) {
    return {
      competencias: [],
      ms: 0,
      mensagens,
      erro: err instanceof Error ? err.message : String(err),
      tentativas: err instanceof ErroChat ? err.tentativas : [],
    };
  }

  const base = {
    ms: resposta.ms,
    provedor: resposta.provedor,
    model: resposta.model,
    mensagens,
    respostaCrua: resposta.content,
    tentativas: resposta.tentativas,
  };
  try {
    const lido = Competencias.safeParse(extrairLista(resposta.content));
    if (!lido.success) throw new Error(lido.error.issues[0]?.message ?? "formato inválido");
    // Linguagem sai aqui: não entra nem no "não avaliado" nem na lista de competências.
    const semLinguagem = lido.data.filter((c) => !ehLinguagem(c));
    return { ...base, competencias: semLinguagem.slice(0, MAX_COMPETENCIAS) };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return { ...base, competencias: [], erro: `resposta inválida: ${motivo}` };
  }
}
