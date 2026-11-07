/**
 * Estado interno da sessão (só servidor) e a visão de debug que GET /api/state devolve.
 */
import type { AnalystOutput } from "@/lib/agents/analystSchema";
import type { HiddenTestsResult } from "@/lib/agents/hiddenTests";
import type { Blip, InterviewConfig, LineRange, Report, SessionEvent } from "@/lib/contracts";
import type { LlmStatsSnapshot } from "@/lib/llm";

/** Pergunta preparada pelo Analyst, ainda não necessariamente virou blip. */
export interface QueuedQuestion {
  id: string;
  question: string;
  followUpTopic: string;
  /** 2–5 palavras pro balão ("o loop interno"). Nunca revela o erro. */
  topicLabel?: string;
  priority: number; // 0–1
  highlight?: LineRange;
  createdAt: number; // t da sessão
  /** ignored: o balão expirou sem clique. */
  status: "queued" | "blipped" | "asked" | "stale" | "ignored";
  /** Pergunta fixa de abertura ("me conta como pretende resolver"), não vem do Analyst. */
  kickoff?: boolean;
  /** Momento-chave que gerou a pergunta ("primeiro run verde"): tem algo pra falar ali, então ganha passagem. */
  keyMoment?: string;
  /** Candidato clicou "agora não": a pergunta só volta a partir deste t. */
  snoozedUntil?: number;
}

/** Observação pra rubrica, acumulada ao longo da sessão (o Evaluator lê tudo). */
export interface EvidenceNote {
  t: number;
  criterionId: string;
  note: string;
  source: "analyst" | "interviewer";
}

export interface AnalystStatus {
  state: "idle" | "running";
  lastTrigger?: SessionEvent["type"];
  lastRunAt?: number; // t da sessão
  runs: number;
  /** Última análise do LLM (sem as perguntas, que vão pra fila). */
  insights?: Omit<AnalystOutput, "questions">;
  lastError?: string;
  /** Resultado da última tentativa, em português ("2 perguntas, 1 barrada pelo filtro", "pulada: código igual"). */
  lastOutcome?: { t: number; text: string };
  lastDurationMs?: number;
  /** Custo acumulado em US$ reportado pela Featherless. */
  costUsd: number;
}

/** Avaliação final: começa no session_ended e fica guardada na sessão. */
export interface ReportStatus {
  state: "running" | "done" | "error";
  startedAt: number; // Date.now() no servidor
  durationMs?: number;
  report?: Report;
  hiddenTests?: HiddenTestsResult;
  error?: string;
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
  evidence: EvidenceNote[];
  /** Quando a última conversa (blip ou chamada do candidato) terminou, em t da sessão. */
  lastConversationEndedAt?: number;
  report?: ReportStatus;
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
  evidence: EvidenceNote[];
  /** Estado da avaliação final (o relatório em si sai em GET /api/report). */
  report?: Omit<ReportStatus, "report">;
  /** Estatísticas dos LLMs (Featherless x OpenRouter) desde o start do servidor. */
  llm?: LlmStatsSnapshot;
}
