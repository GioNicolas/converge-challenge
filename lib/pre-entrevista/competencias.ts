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
  /** O que a pessoa vai fazer, em até 12 palavras, sem o cargo (ex.: "criar modelos de previsão de churn com Python e SQL"). */
  resumo?: string;
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

/**
 * Featherless primeiro (gemma, plano fixo), OpenRouter só de reserva. A chamada é feita ao criar a sessão, em
 * segundo plano (fila "fundo"). O timeout da Featherless é 15 s, porque ela pode passar dos 8 s do alvo antigo.
 * Qualquer falha segue sem competências.
 */
export const ALVOS: Alvo[] = [
  { provedor: "featherless", model: "google/gemma-4-26B-A4B-it", timeoutMs: 15_000 },
  { provedor: "openrouter", model: "google/gemini-2.5-flash-lite", timeoutMs: 8_000 },
];

const Competencias = z.array(
  z.object({
    nome: z.string().trim().min(1).max(60),
    tipo: z.enum(["linguagem", "tecnologia", "conhecimento"]),
    verificavel: z.object({ live_coding: z.boolean(), system_design: z.boolean() }),
  }),
);

/** Resumo da vaga: até 12 palavras, sem ponto final. Se não passar, vira `undefined` e a sessão segue sem ele. */
const Resumo = z
  .string()
  .trim()
  .transform((t) => t.replace(/[.;:]+$/, "").trim())
  .refine((t) => t.length > 0 && t.split(/\s+/).length <= 12, "resumo vazio ou com mais de 12 palavras")
  .optional()
  .catch(undefined);

/** A resposta: o resumo (opcional, sem falhar a chamada) e a lista de competências (obrigatória). */
const Resposta = z.object({ resumo: Resumo, competencias: Competencias });

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

Também escreva o resumo: o que a pessoa vai fazer no dia a dia, em português, em até 12 palavras, sem repetir o cargo e sem ponto final.
Ex.: "criar modelos de previsão de churn com Python e SQL".

Responda só com JSON, sem texto antes ou depois, sem cercas de código:
{"resumo": "criar modelos de previsão de churn com Python e SQL", "competencias": [{"nome": "Kafka", "tipo": "tecnologia", "verificavel": {"live_coding": false, "system_design": true}}]}`;

/** Pega o JSON da resposta (objeto ou lista), tirando cercas de código e texto em volta. */
function extrairJson(texto: string): unknown {
  const semCerca = texto.replace(/```(?:json)?/gi, "");
  const inicio = semCerca.search(/[[{]/);
  const fim = semCerca.lastIndexOf(semCerca[inicio] === "{" ? "}" : "]");
  if (inicio === -1 || fim <= inicio) throw new Error(`nenhum JSON na resposta: ${texto.slice(0, 200)}`);
  return JSON.parse(semCerca.slice(inicio, fim + 1));
}

export async function extrairCompetencias(vaga: Vaga): Promise<ResultadoCompetencias> {
  const mensagens: Mensagem[] = [
    { role: "system", content: PROMPT_SISTEMA },
    { role: "user", content: `CARGO: ${vaga.roleTitle}\n\nVAGA:\n${vaga.jobDescription}` },
  ];

  let resposta: Awaited<ReturnType<typeof chat>>;
  try {
    resposta = await chat({ alvos: ALVOS, messages: mensagens, temperature: 0, maxTokens: 800, prioridade: "fundo" });
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
    const json = extrairJson(resposta.content);
    // Resposta só com a lista (formato antigo) ainda vale, sem resumo.
    const lido = Resposta.safeParse(Array.isArray(json) ? { competencias: json } : json);
    if (!lido.success) throw new Error(lido.error.issues[0]?.message ?? "formato inválido");
    // Linguagem sai aqui: não entra nem no "não avaliado" nem na lista de competências.
    const semLinguagem = lido.data.competencias.filter((c) => !ehLinguagem(c));
    return { ...base, resumo: lido.data.resumo, competencias: semLinguagem.slice(0, MAX_COMPETENCIAS) };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return { ...base, competencias: [], erro: `resposta inválida: ${motivo}` };
  }
}
