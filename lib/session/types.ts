/**
 * Estado interno da sessão (só servidor) e a visão de debug que GET /api/state devolve.
 */
import type { AnalystOutput } from "@/lib/agents/analystSchema";
import type { Blip, InterviewConfig, LineRange, SessionEvent } from "@/lib/contracts";
import type { LlmStatsSnapshot } from "@/lib/llm";

/** Pergunta preparada pelo Analyst, ainda não necessariamente virou blip. */
export interface QueuedQuestion {
  id: string;
  question: string;
  followUpTopic: string;
  priority: number; // 0–1
  highlight?: LineRange;
  createdAt: number; // t da sessão
  status: "queued" | "blipped" | "asked" | "stale";
}

export interface AnalystStatus {
  state: "idle" | "running";
  lastTrigger?: SessionEvent["type"];
  lastRunAt?: number; // t da sessão
  runs: number;
  /** Última análise do LLM (sem as perguntas, que vão pra fila). */
  insights?: Omit<AnalystOutput, "questions">;
  lastError?: string;
  lastDurationMs?: number;
  /** Custo acumulado em US$ reportado pela Featherless. */
  costUsd: number;
}

export interface CodeVersion {
  t: number;
  version: number;
  language: string;
  code: string;
}

export interface SessionState {
  sessionId: string;
  config: InterviewConfig;
  startedAt: number; // Date.now() no servidor
  events: SessionEvent[];
  codeHistory: CodeVersion[];
  language: string;
  analyst: AnalystStatus;
  queue: QueuedQuestion[];
  blips: Blip[];
  pendingBlipId?: string;
  hintsUsed: number;
  ended: boolean;
}

/** Resposta de GET /api/state?sessionId=... */
export interface SessionStateView {
  sessionId: string;
  configId: string;
  roleTitle: string;
  language: string;
  latestCode: string;
  version: number;
  eventCount: number;
  lastEvent?: { type: SessionEvent["type"]; t: number };
  analyst: AnalystStatus;
  queue: QueuedQuestion[];
  blips: Blip[];
  pendingBlipId?: string;
  hintsUsed: number;
  ended: boolean;
  /** Estatísticas dos LLMs (Featherless x OpenRouter) desde o start do servidor. */
  llm?: LlmStatsSnapshot;
}
