/**
 * Ponto único de acesso aos LLMs. Cada papel tem um modelo primário (Featherless) e um de reserva
 * (OpenRouter). A Featherless segue primária; o OpenRouter entra quando ela falha ou demora demais.
 * Trocar de modelo ou de provedor é env/config: quem chama só usa completeJson.
 */
import type { z } from "zod";
import { featherless } from "./featherless";
import { openrouter } from "./openrouter";
import {
  chatJsonVia,
  isAbortError,
  LlmProviderError,
  type ChatJsonResult,
  type ChatRequest,
  type LlmProviderName,
  type ProviderConfig,
  type ReasoningEffort,
} from "./openaiCompat";

export type { ChatJsonResult, LlmProviderName };

export type LlmRole = "analyst" | "evaluator" | "fast" | "interviewer";

interface RoleConfig {
  featherlessEnv: string;
  featherlessDefault: string;
  openrouterEnv: string;
  openrouterDefault: string;
  maxTokens: number;
  reasoningEffort?: ReasoningEffort;
  /** Ms até disparar o OpenRouter em paralelo. Sem valor: só fallback em erro. */
  hedgeMs?: number;
}

const ROLE_CONFIG: Record<LlmRole, RoleConfig> = {
  analyst: {
    featherlessEnv: "ANALYST_MODEL",
    featherlessDefault: "zai-org/GLM-5.3-Flash",
    openrouterEnv: "ANALYST_FALLBACK_MODEL",
    openrouterDefault: "z-ai/glm-5.3-flash",
    maxTokens: 4000,
    reasoningEffort: "low",
    hedgeMs: 12_000,
  },
  fast: {
    featherlessEnv: "FAST_MODEL",
    featherlessDefault: "google/gemma-4-31B-it",
    openrouterEnv: "FAST_FALLBACK_MODEL",
    openrouterDefault: "openai/gpt-oss-120b",
    maxTokens: 800,
    // Filtro de fala fica no caminho de cada resposta do chat (normalmente ~1 s): esperar mais trava a conversa.
    hedgeMs: 3_000,
  },
  evaluator: {
    featherlessEnv: "EVALUATOR_MODEL",
    featherlessDefault: "zai-org/GLM-5.2",
    openrouterEnv: "EVALUATOR_FALLBACK_MODEL",
    openrouterDefault: "z-ai/glm-5.2",
    maxTokens: 6000,
    // A recrutadora espera o relatório na tela: com a Featherless lenta, o OpenRouter entra em paralelo.
    hedgeMs: 30_000,
  },
  interviewer: {
    featherlessEnv: "INTERVIEWER_MODEL",
    featherlessDefault: "zai-org/GLM-5.3-Flash",
    openrouterEnv: "INTERVIEWER_FALLBACK_MODEL",
    openrouterDefault: "z-ai/glm-5.3-flash",
    maxTokens: 1500,
    reasoningEffort: "low",
    // O candidato está olhando o "digitando…": normalmente responde em ~2,5 s.
    hedgeMs: 5_000,
  },
};

const PROVIDERS: Record<LlmProviderName, ProviderConfig> = { featherless, openrouter };

// Breaker: 2 derrotas seguidas da Featherless desviam o papel para o OpenRouter por 3 min.
const BREAKER_THRESHOLD = 2;
const BREAKER_WINDOW_MS = 3 * 60_000;

// ---- Estado e estatísticas: em globalThis, para sobreviver a hot reload do Next em dev. ----

interface ProviderStore {
  calls: number;
  wins: number;
  failures: number;
  /** Perdeu a corrida e foi abortada. Custo e latência desconhecidos: não entram nos totais. */
  lost: number;
  costUsd: number;
  totalMs: number;
  /** Chamadas que terminaram sozinhas (sucesso ou falha): base do avgMs. */
  timed: number;
}

interface RoleStore {
  consecutiveSlow: number;
  directUntil?: number;
}

interface LlmState {
  providers: Record<LlmProviderName, ProviderStore>;
  roles: Record<LlmRole, RoleStore>;
}

const emptyProvider = (): ProviderStore => ({
  calls: 0,
  wins: 0,
  failures: 0,
  lost: 0,
  costUsd: 0,
  totalMs: 0,
  timed: 0,
});

const globalWithLlm = globalThis as typeof globalThis & { __llmState?: LlmState };
const state: LlmState = (globalWithLlm.__llmState ??= {
  providers: { featherless: emptyProvider(), openrouter: emptyProvider() },
  roles: {
    analyst: { consecutiveSlow: 0 },
    fast: { consecutiveSlow: 0 },
    evaluator: { consecutiveSlow: 0 },
    interviewer: { consecutiveSlow: 0 },
  },
});
// Estado criado por uma versão anterior do módulo pode não ter papéis novos (aconteceu com "interviewer").
for (const role of Object.keys(ROLE_CONFIG) as LlmRole[]) state.roles[role] ??= { consecutiveSlow: 0 };

export interface ProviderStatsSnapshot {
  calls: number;
  wins: number;
  failures: number;
  lost: number;
  costUsd: number;
  avgMs: number | null;
}

export interface RoleStatsSnapshot {
  /** Provedor que a próxima chamada do papel usa. */
  route: LlmProviderName;
  /** Epoch ms em que o breaker fecha; presente só enquanto ele está aberto. */
  directUntil?: number;
}

export interface LlmStatsSnapshot {
  providers: Record<LlmProviderName, ProviderStatsSnapshot>;
  roles: Record<LlmRole, RoleStatsSnapshot>;
}

function providerSnapshot(p: ProviderStore): ProviderStatsSnapshot {
  return {
    calls: p.calls,
    wins: p.wins,
    failures: p.failures,
    lost: p.lost,
    costUsd: p.costUsd,
    avgMs: p.timed === 0 ? null : Math.round(p.totalMs / p.timed),
  };
}

function roleSnapshot(r: RoleStore, now: number): RoleStatsSnapshot {
  if (!breakerActive(r, now) || r.directUntil === undefined) return { route: "featherless" };
  return { route: "openrouter", directUntil: r.directUntil };
}

export function getLlmStats(): LlmStatsSnapshot {
  const now = Date.now();
  return {
    providers: {
      featherless: providerSnapshot(state.providers.featherless),
      openrouter: providerSnapshot(state.providers.openrouter),
    },
    roles: {
      analyst: roleSnapshot(state.roles.analyst, now),
      fast: roleSnapshot(state.roles.fast, now),
      evaluator: roleSnapshot(state.roles.evaluator, now),
      interviewer: roleSnapshot(state.roles.interviewer, now),
    },
  };
}

function breakerActive(r: RoleStore, now: number): boolean {
  return r.directUntil !== undefined && r.directUntil > now;
}

function recordWin(name: LlmProviderName): void {
  state.providers[name].wins += 1;
}

/** Uma chamada a um provedor, com contabilidade. Não decide quem venceu: isso é do chamador. */
async function attempt<T>(provider: ProviderConfig, req: ChatRequest<T>): Promise<ChatJsonResult<T>> {
  const stats = state.providers[provider.name];
  stats.calls += 1;
  const started = Date.now();
  try {
    const result = await chatJsonVia(provider, req);
    stats.costUsd += result.costUsd;
    stats.totalMs += result.durationMs;
    stats.timed += 1;
    return result;
  } catch (err) {
    if (isAbortError(err)) {
      stats.lost += 1;
      throw err;
    }
    stats.failures += 1;
    stats.timed += 1;
    stats.totalMs += Date.now() - started;
    if (err instanceof LlmProviderError) stats.costUsd += err.costUsd;
    throw err;
  }
}

// ---- Roteamento ----

interface RoleCall<T> {
  base: Omit<ChatRequest<T>, "model" | "signal">;
  models: Record<LlmProviderName, string>;
}

function requestFor<T>(call: RoleCall<T>, name: LlmProviderName, signal?: AbortSignal): ChatRequest<T> {
  return { ...call.base, model: call.models[name], signal };
}

type Settled<T> = { ok: true; value: ChatJsonResult<T> } | { ok: false; error: string };

/** Como attempt, mas nunca rejeita: devolve o erro já com o nome do provedor. */
async function runSettled<T>(call: RoleCall<T>, name: LlmProviderName, signal?: AbortSignal): Promise<Settled<T>> {
  try {
    return { ok: true, value: await attempt(PROVIDERS[name], requestFor(call, name, signal)) };
  } catch (err) {
    return { ok: false, error: `${name}: ${errMsg(err)}` };
  }
}

/** Primeiro sucesso entre as chamadas; se todas falharem, junta os erros. */
function firstSuccess<T>(runs: Array<Promise<Settled<T>>>): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    let pending = runs.length;
    for (const run of runs) {
      void run.then((s) => {
        if (s.ok) {
          resolve(s);
          return;
        }
        errors.push(s.error);
        pending -= 1;
        if (pending === 0) resolve({ ok: false, error: errors.join(" | ") });
      });
    }
  });
}

function breakerIsOpen(role: LlmRole): boolean {
  const store = state.roles[role];
  if (store.directUntil === undefined) return false;
  if (breakerActive(store, Date.now())) return true;
  store.directUntil = undefined;
  console.info(`[llm] ${role}: rota direta encerrada, voltando à featherless`);
  return false;
}

function noteFeatherlessWon(role: LlmRole): void {
  state.roles[role].consecutiveSlow = 0;
}

function noteFeatherlessSlow(role: LlmRole): void {
  const store = state.roles[role];
  store.consecutiveSlow += 1;
  if (store.consecutiveSlow < BREAKER_THRESHOLD || breakerActive(store, Date.now())) return;
  store.directUntil = Date.now() + BREAKER_WINDOW_MS;
  console.info(`[llm] ${role}: rota direta openrouter por ${BREAKER_WINDOW_MS / 60_000} min`);
}

/** Featherless primeiro; se até hedgeMs não responder, o OpenRouter corre junto. O primeiro sucesso vence. */
async function callHedged<T>(role: LlmRole, call: RoleCall<T>, hedgeMs: number): Promise<ChatJsonResult<T>> {
  const flAbort = new AbortController();
  const orAbort = new AbortController();
  const fl = runSettled(call, "featherless", flAbort.signal);

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  const hedgeFired = new Promise<"hedge">((resolve) => {
    hedgeTimer = setTimeout(() => resolve("hedge"), hedgeMs);
  });
  const early = await Promise.race([fl, hedgeFired]);
  clearTimeout(hedgeTimer);

  if (early !== "hedge" && early.ok) {
    recordWin("featherless");
    noteFeatherlessWon(role);
    return early.value;
  }
  console.info(
    early === "hedge"
      ? `[llm] ${role}: featherless >${Math.round(hedgeMs / 1000)}s, disparando openrouter`
      : `[llm] ${role}: ${early.error.slice(0, 160)}; disparando openrouter`,
  );

  const or = runSettled(call, "openrouter", orAbort.signal);
  const winner = await firstSuccess([fl, or]);
  if (!winner.ok) {
    noteFeatherlessSlow(role);
    throw new Error(winner.error);
  }
  recordWin(winner.value.provider);
  if (winner.value.provider === "featherless") {
    orAbort.abort();
    noteFeatherlessWon(role);
  } else {
    flAbort.abort();
    noteFeatherlessSlow(role);
  }
  return winner.value;
}

/** Sem hedge (evaluator): Featherless; em erro, uma tentativa no OpenRouter. */
async function callWithFallback<T>(role: LlmRole, call: RoleCall<T>): Promise<ChatJsonResult<T>> {
  const primary = await runSettled(call, "featherless");
  if (primary.ok) {
    recordWin("featherless");
    noteFeatherlessWon(role);
    return primary.value;
  }
  noteFeatherlessSlow(role);
  console.info(`[llm] ${role}: ${primary.error.slice(0, 160)}; tentando openrouter`);
  const backup = await runSettled(call, "openrouter");
  if (backup.ok) {
    recordWin("openrouter");
    return backup.value;
  }
  throw new Error(`${primary.error} | ${backup.error}`);
}

async function callOnly<T>(call: RoleCall<T>, name: LlmProviderName): Promise<ChatJsonResult<T>> {
  const result = await attempt(PROVIDERS[name], requestFor(call, name));
  recordWin(name);
  return result;
}

export async function completeJson<T>(opts: {
  role: LlmRole;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}): Promise<ChatJsonResult<T>> {
  const cfg = ROLE_CONFIG[opts.role];
  const call: RoleCall<T> = {
    base: {
      system: opts.system,
      user: opts.user,
      schema: opts.schema,
      maxTokens: opts.maxTokens ?? cfg.maxTokens,
      reasoningEffort: cfg.reasoningEffort,
    },
    models: {
      featherless: process.env[cfg.featherlessEnv] || cfg.featherlessDefault,
      openrouter: process.env[cfg.openrouterEnv] || cfg.openrouterDefault,
    },
  };

  // Sem chave do OpenRouter: comportamento de antes, só Featherless.
  if (!process.env.OPENROUTER_API_KEY) return callOnly(call, "featherless");
  if (breakerIsOpen(opts.role)) return callOnly(call, "openrouter");
  if (cfg.hedgeMs === undefined) return callWithFallback(opts.role, call);
  return callHedged(opts.role, call, cfg.hedgeMs);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
