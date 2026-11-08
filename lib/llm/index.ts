/**
 * Ponto único de acesso aos LLMs. Cada papel tem um modelo primário (Featherless) e um de reserva
 * (OpenRouter). A Featherless segue primária; o OpenRouter entra quando ela falha ou demora demais.
 * Trocar de modelo ou de provedor é env/config: quem chama só usa completeJson.
 */
import type { z } from "zod";
import { featherless } from "./featherless";
import { openrouter } from "./openrouter";
import {
  abortError,
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

export type LlmRole = "analyst" | "conversa" | "evaluator" | "fast" | "interviewer";

/** Papéis que respondem a uma fala ao vivo: passam na frente na fila e nunca esperam uma análise acabar. */
const PAPEIS_DE_FALA: ReadonlySet<LlmRole> = new Set(["conversa", "fast", "interviewer"]);

interface RoleConfig {
  featherlessEnv: string;
  featherlessDefault: string;
  openrouterEnv: string;
  openrouterDefault: string;
  maxTokens: number;
  reasoningEffort?: ReasoningEffort;
  /** Só este provedor recebe `reasoningEffort` (quando os modelos dos dois são de famílias diferentes). */
  raciocinioSo?: LlmProviderName;
  /** Provedor que corre primeiro. Padrão: Featherless (o outro é a reserva, no hedge, no erro e no breaker). */
  primario?: LlmProviderName;
  /** Ms até disparar a reserva em paralelo. Sem valor: só fallback em erro. */
  hedgeMs?: number;
  /** Temperatura (sem valor, a do provedor). */
  temperatura?: number;
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
  conversa: {
    // Responde à fala do candidato ao vivo (quadro e live coding). Medido com scripts/bench-conversa.ts:
    // gemini-3.5-flash-lite acertou 27/27 casos com p50 1,6 s e p95 2,0 s; o GLM na Featherless acerta, mas
    // tem p95 de ~8 s. Por isso aqui o OpenRouter é o primário e o GLM, a reserva.
    primario: "openrouter",
    openrouterEnv: "CONVERSA_AO_VIVO_MODEL",
    openrouterDefault: "google/gemini-3.5-flash-lite",
    featherlessEnv: "CONVERSA_AO_VIVO_RESERVA_MODEL",
    featherlessDefault: "zai-org/GLM-5.3-Flash",
    maxTokens: 1500,
    reasoningEffort: "low",
    raciocinioSo: "featherless",
    hedgeMs: 2_500,
    // Mais baixa que o padrão: as regras de fala (devolver a vez, recusar, ficar quieto) variavam entre rodadas.
    temperatura: 0.3,
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

// Breaker: 2 derrotas seguidas do primário desviam o papel para a reserva por 3 min.
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
    conversa: { consecutiveSlow: 0 },
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

function roleSnapshot(role: LlmRole, r: RoleStore, now: number): RoleStatsSnapshot {
  const [primario, reserva] = ordem(role);
  if (!breakerActive(r, now) || r.directUntil === undefined) return { route: primario };
  return { route: reserva, directUntil: r.directUntil };
}

/** [primário, reserva] do papel. */
function ordem(role: LlmRole): [LlmProviderName, LlmProviderName] {
  return ROLE_CONFIG[role].primario === "openrouter" ? ["openrouter", "featherless"] : ["featherless", "openrouter"];
}

export function getLlmStats(): LlmStatsSnapshot {
  const now = Date.now();
  return {
    providers: {
      featherless: providerSnapshot(state.providers.featherless),
      openrouter: providerSnapshot(state.providers.openrouter),
    },
    roles: {
      analyst: roleSnapshot("analyst", state.roles.analyst, now),
      conversa: roleSnapshot("conversa", state.roles.conversa, now),
      fast: roleSnapshot("fast", state.roles.fast, now),
      evaluator: roleSnapshot("evaluator", state.roles.evaluator, now),
      interviewer: roleSnapshot("interviewer", state.roles.interviewer, now),
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
  base: Omit<ChatRequest<T>, "model" | "signal" | "reasoningEffort">;
  models: Record<LlmProviderName, string>;
  reasoning: Record<LlmProviderName, ReasoningEffort | undefined>;
}

function requestFor<T>(call: RoleCall<T>, name: LlmProviderName, signal?: AbortSignal): ChatRequest<T> {
  return { ...call.base, model: call.models[name], reasoningEffort: call.reasoning[name], signal };
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
  console.info(`[llm] ${role}: rota direta encerrada, voltando à ${ordem(role)[0]}`);
  return false;
}

function notePrimaryWon(role: LlmRole): void {
  state.roles[role].consecutiveSlow = 0;
}

function notePrimarySlow(role: LlmRole): void {
  const store = state.roles[role];
  store.consecutiveSlow += 1;
  if (store.consecutiveSlow < BREAKER_THRESHOLD || breakerActive(store, Date.now())) return;
  store.directUntil = Date.now() + BREAKER_WINDOW_MS;
  console.info(`[llm] ${role}: rota direta ${ordem(role)[1]} por ${BREAKER_WINDOW_MS / 60_000} min`);
}

/** Um controlador que aborta junto com o sinal de quem chamou (se houver). */
function filhoDe(signal: AbortSignal | undefined): AbortController {
  const c = new AbortController();
  if (signal?.aborted) c.abort();
  else signal?.addEventListener("abort", () => c.abort(), { once: true });
  return c;
}

/** Primário primeiro; se até hedgeMs não responder, a reserva corre junto. O primeiro sucesso vence. */
async function callHedged<T>(
  role: LlmRole,
  call: RoleCall<T>,
  hedgeMs: number,
  signal?: AbortSignal,
): Promise<ChatJsonResult<T>> {
  if (signal?.aborted) throw abortError();
  const [primario, reserva] = ordem(role);
  const priAbort = filhoDe(signal);
  const resAbort = filhoDe(signal);
  const pri = runSettled(call, primario, priAbort.signal);

  let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
  const hedgeFired = new Promise<"hedge">((resolve) => {
    hedgeTimer = setTimeout(() => resolve("hedge"), hedgeMs);
  });
  const early = await Promise.race([pri, hedgeFired]);
  clearTimeout(hedgeTimer);
  if (signal?.aborted) throw abortError();

  if (early !== "hedge" && early.ok) {
    recordWin(primario);
    notePrimaryWon(role);
    return early.value;
  }
  console.info(
    early === "hedge"
      ? `[llm] ${role}: ${primario} >${(hedgeMs / 1000).toFixed(1)}s, disparando ${reserva}`
      : `[llm] ${role}: ${early.error.slice(0, 160)}; disparando ${reserva}`,
  );

  const res = runSettled(call, reserva, resAbort.signal);
  const winner = await firstSuccess([pri, res]);
  if (signal?.aborted) throw abortError();
  if (!winner.ok) {
    notePrimarySlow(role);
    throw new Error(winner.error);
  }
  recordWin(winner.value.provider);
  if (winner.value.provider === primario) {
    resAbort.abort();
    notePrimaryWon(role);
  } else {
    priAbort.abort();
    notePrimarySlow(role);
  }
  return winner.value;
}

/** Sem hedge (evaluator): primário; em erro, uma tentativa na reserva. */
async function callWithFallback<T>(role: LlmRole, call: RoleCall<T>, signal?: AbortSignal): Promise<ChatJsonResult<T>> {
  const [primario, reserva] = ordem(role);
  const primary = await runSettled(call, primario, signal);
  if (signal?.aborted) throw abortError();
  if (primary.ok) {
    recordWin(primario);
    notePrimaryWon(role);
    return primary.value;
  }
  notePrimarySlow(role);
  console.info(`[llm] ${role}: ${primary.error.slice(0, 160)}; tentando ${reserva}`);
  const backup = await runSettled(call, reserva, signal);
  if (signal?.aborted) throw abortError();
  if (backup.ok) {
    recordWin(reserva);
    return backup.value;
  }
  throw new Error(`${primary.error} | ${backup.error}`);
}

async function callOnly<T>(call: RoleCall<T>, name: LlmProviderName, signal?: AbortSignal): Promise<ChatJsonResult<T>> {
  const result = await attempt(PROVIDERS[name], requestFor(call, name, signal));
  recordWin(name);
  return result;
}

export async function completeJson<T>(opts: {
  role: LlmRole;
  system: string;
  user: string;
  schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  maxTokens?: number;
  /**
   * Cancela a chamada de verdade: aborta o fetch em voo, sai da fila e não faz retry. Sem isso, uma chamada
   * que o chamador já desistiu de esperar segura a vaga do provedor e a próxima fala fica na fila.
   */
  signal?: AbortSignal;
  /** Tempo total que quem chama vai esperar: retry e reparo de JSON só acontecem se couberem nele. */
  prazoMs?: number;
}): Promise<ChatJsonResult<T>> {
  const cfg = ROLE_CONFIG[opts.role];
  const fala = PAPEIS_DE_FALA.has(opts.role);
  const call: RoleCall<T> = {
    base: {
      system: opts.system,
      user: opts.user,
      schema: opts.schema,
      maxTokens: opts.maxTokens ?? cfg.maxTokens,
      ...(cfg.temperatura !== undefined ? { temperature: cfg.temperatura } : {}),
      priorizarLatencia: fala,
      prioridade: fala ? "fala" : "fundo",
      ...(opts.prazoMs !== undefined ? { prazoAte: Date.now() + opts.prazoMs } : {}),
    },
    models: {
      featherless: process.env[cfg.featherlessEnv] || cfg.featherlessDefault,
      openrouter: process.env[cfg.openrouterEnv] || cfg.openrouterDefault,
    },
    reasoning: {
      featherless: !cfg.raciocinioSo || cfg.raciocinioSo === "featherless" ? cfg.reasoningEffort : undefined,
      openrouter: !cfg.raciocinioSo || cfg.raciocinioSo === "openrouter" ? cfg.reasoningEffort : undefined,
    },
  };

  // Sem chave do OpenRouter: comportamento de antes, só Featherless.
  if (!process.env.OPENROUTER_API_KEY) return callOnly(call, "featherless", opts.signal);
  if (breakerIsOpen(opts.role)) return callOnly(call, ordem(opts.role)[1], opts.signal);
  if (cfg.hedgeMs === undefined) return callWithFallback(opts.role, call, opts.signal);
  return callHedged(opts.role, call, cfg.hedgeMs, opts.signal);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
