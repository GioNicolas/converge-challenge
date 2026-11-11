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

export type LlmRole = "analyst" | "codigo" | "conversa" | "conversa_quadro" | "evaluator" | "fast" | "filtro" | "interviewer" | "quadro" | "relatorio";

/** Papéis que respondem a uma fala ao vivo: passam na frente na fila e nunca esperam uma análise acabar. */
const PAPEIS_DE_FALA: ReadonlySet<LlmRole> = new Set(["conversa", "conversa_quadro", "fast", "filtro", "interviewer"]);

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
  /** Tempo máximo de cada tentativa (sem valor, 90 s). */
  tempoPorTentativaMs?: number;
}

const ROLE_CONFIG: Record<LlmRole, RoleConfig> = {
  analyst: {
    featherlessEnv: "ANALYST_MODEL",
    featherlessDefault: "zai-org/GLM-5.3-Flash",
    openrouterEnv: "ANALYST_FALLBACK_MODEL",
    openrouterDefault: "z-ai/glm-5.3-flash",
    maxTokens: 4000,
    reasoningEffort: "low",
    // Conversa de plano com a recrutadora (alguém esperando). A análise do live coding tem o papel "codigo".
    hedgeMs: 12_000,
  },
  fast: {
    featherlessEnv: "FAST_FEATHERLESS_MODEL",
    // O 31B passou de 8 s em toda análise com ~6 mil tokens (scripts/bench-quadro.ts); o 26B-A4B (MoE) é bem
    // mais rápido com o mesmo tamanho de prompt.
    featherlessDefault: "google/gemma-4-26B-A4B-it",
    openrouterEnv: "FAST_FALLBACK_MODEL",
    openrouterDefault: "openai/gpt-oss-120b",
    maxTokens: 800,
    // Extrator da memória da squad, em segundo plano: sem hedge (o OpenRouter só entra se a Featherless falhar).
    // Os filtros (da fala ao vivo e das perguntas da análise) usam o papel "filtro".
  },
  evaluator: {
    // Kit da vaga, plano e o que não tem papel próprio: a recrutadora espera na tela. O kit roda em
    // app/api/avaliacoes (maxDuration 120 s) e gerarKit tenta até 2 vezes. scripts/gerar-kit.ts em 2026-11-10: o
    // GLM-5.2 na Featherless estourou os 90 s da tentativa; o gemini-3.5-flash-lite gerou o kit em 9–10 s
    // (validou de primeira, US$ 0,0067). Reserva aos 45 s: duas tentativas (2 × 45 s + 2 × 10 s) cabem nos 120 s.
    // No kit a reserva ainda entra quase sempre, mas a Featherless é plano fixo: o que custa é o modelo da reserva,
    // e o gemini sai ~10× mais barato que o GLM-5.2 na OpenRouter (US$ 6,80 por milhão de tokens de saída).
    featherlessEnv: "EVALUATOR_MODEL",
    featherlessDefault: "zai-org/GLM-5.2",
    openrouterEnv: "EVALUATOR_FALLBACK_MODEL",
    openrouterDefault: "google/gemini-3.5-flash-lite",
    maxTokens: 6000,
    hedgeMs: 45_000,
  },
  relatorio: {
    // Relatório final da entrevista (live coding e quadro). Ninguém espera por ele na hora: vale qualidade e custo.
    // O GLM-5.2 na Featherless leva ~3 min (scripts/run-evaluator.ts sem OpenRouter: 177 s, US$ 0,014 em créditos);
    // com a reserva em 30 s o OpenRouter corria junto e era pago em toda entrevista (US$ 0,014–0,045, o maior custo
    // dela). Agora a Featherless tem 4,5 min sozinha, numa tentativa só, e o OpenRouter só entra se ela não entregar.
    // Com função mais longa (Pro): LLM_HEDGE_RELATORIO em ms.
    // Reserva medida em 2026-11-10 (scripts/eval-scorecard.ts, 6 cenários /base, e scripts/run-evaluator.ts
    // fixtures/forca-bruta.json, 2 rodadas cada): gemini-3.5-flash-lite 12/12 scorecards sem falha e sem reparo de
    // JSON, 4–6 s, ~US$ 0,0045 por scorecard e ~US$ 0,002 por relatório do live coding (o GLM-5.2 na OpenRouter
    // custava ~US$ 0,034); notas a no máximo 1 ponto do GLM-5.2 da Featherless. gpt-oss-120b precisou de reparo de JSON
    // nas duas rodadas e deixou complexidade e bordas sem nota no live coding; glm-5.3-flash falhou 2 de 4 scorecards.
    featherlessEnv: "RELATORIO_MODEL",
    featherlessDefault: "zai-org/GLM-5.2",
    openrouterEnv: "RELATORIO_FALLBACK_MODEL",
    openrouterDefault: "google/gemini-3.5-flash-lite",
    maxTokens: 6000,
    hedgeMs: 270_000,
    tempoPorTentativaMs: 290_000,
  },
  conversa: {
    // Responde à fala do candidato ao vivo (quadro e live coding). Medido com scripts/bench-conversa.ts:
    // gemini-3.5-flash-lite acertou 27/27 casos com p50 1,6 s e p95 2,0 s; o GLM na Featherless acerta, mas
    // tem p95 de ~8 s. Por isso aqui o OpenRouter é o primário.
    // Reserva: gemma-4-26B-A4B na Featherless (scripts/bench-conversa.ts em 2026-11-09: acerta tanto quanto o
    // gemini-3.5-flash-lite, 39/45, mas com p50 2,6 s e cauda de 4–8 s, por isso não é o primário). O GLM tinha p95 ~8 s.
    // Variável nova para não herdar a antiga, que apontava o GLM.
    primario: "openrouter",
    openrouterEnv: "CONVERSA_AO_VIVO_MODEL",
    openrouterDefault: "google/gemini-3.5-flash-lite",
    featherlessEnv: "CONVERSA_FEATHERLESS_MODEL",
    featherlessDefault: "google/gemma-4-26B-A4B-it",
    maxTokens: 1500,
    hedgeMs: 2_500,
    // Mais baixa que o padrão: as regras de fala (devolver a vez, recusar, ficar quieto) variavam entre rodadas.
    temperatura: 0.3,
  },
  conversa_quadro: {
    // O Totti 2 no quadro (TOTTI_QUADRO=v2): o mesmo lugar do "conversa", com modelo próprio para medir pelo
    // placar (scripts/placar-quadro) sem mexer na pré-entrevista nem na IDE.
    // Reserva: gemma-4-26B-A4B na Featherless (scripts/bench-conversa.ts em 2026-11-09: acerta tanto quanto o
    // gemini-3.5-flash-lite, 39/45, mas com p50 2,6 s e cauda de 4–8 s, por isso não é o primário). O GLM tinha p95 ~8 s.
    // Variável nova para não herdar a antiga, que apontava o GLM.
    primario: "openrouter",
    openrouterEnv: "CONVERSA_QUADRO_MODEL",
    openrouterDefault: "google/gemini-3.5-flash-lite",
    featherlessEnv: "CONVERSA_QUADRO_FEATHERLESS_MODEL",
    featherlessDefault: "google/gemma-4-26B-A4B-it",
    maxTokens: 1500,
    // Sem hedge: com um modelo forte (Sonnet) a resposta passa de 2,5 s quase sempre, a reserva corria junto e
    // ganhava, e duas "derrotas" abriam o disjuntor por 3 min. O Totti falava pela reserva achando que era o Sonnet.
    // A reserva agora só entra em erro (o log perguntar_llm mostra quem respondeu cada turno).
    temperatura: 0.5,
  },
  filtro: {
    // Confere a fala do live coding antes de ela sair (spoiler, validação): fica no caminho de cada resposta.
    // O gemma na Featherless passava de 1,8 s e o filtro era pulado; no OpenRouter fica abaixo de 1 s.
    primario: "openrouter",
    openrouterEnv: "FILTRO_MODEL",
    openrouterDefault: "google/gemini-3.5-flash-lite",
    featherlessEnv: "FILTRO_RESERVA_MODEL",
    featherlessDefault: "google/gemma-4-31B-it",
    maxTokens: 300,
    hedgeMs: 2_000,
    temperatura: 0,
  },
  codigo: {
    // Análise do código no live coding (lib/agents/analyst.ts): decide o que perguntar e quando. Mesmo modelo da
    // análise do quadro. scripts/bench-analista.ts em 2026-11-09 (5 cenários × 3 rodadas, Analyst real):
    // gemma-4-26B-A4B (Featherless) p50 3,3 s, ~US$ 0,0003 por análise, 0 spoiler; gemini-3.7-flash @low
    // (OpenRouter) 10/10, p50 4,5 s, p95 5,6 s, ~US$ 0,004; GLM-5.3-Flash p50 15,6 s, p95 38 s (a pergunta do
    // momento chegava velha). A Featherless vai primeiro (créditos); o gemini entra se ela passar de 15 s.
    featherlessEnv: "ANALISE_CODIGO_FEATHERLESS_MODEL",
    featherlessDefault: "google/gemma-4-26B-A4B-it",
    openrouterEnv: "ANALISE_CODIGO_MODEL",
    openrouterDefault: "google/gemini-3.7-flash",
    maxTokens: 4000,
    // Só no Gemini (reserva): sem isso ele pensa por conta própria (+2,5 s). O gemma não usa raciocínio.
    reasoningEffort: "low",
    raciocinioSo: "openrouter",
    // 15 s: a análise roda em segundo plano e a pergunta ainda espera a pausa dele. Com 8 s, numa entrevista
    // simulada de 10 min o gemini entrou 4 vezes e custou metade da entrevista (US$ 0,017 de US$ 0,044).
    hedgeMs: 15_000,
    temperatura: 0.3,
  },
  quadro: {
    // Análise do desenho no quadro (decide se e o que perguntar), com prazo de 8 s, só com o grafo em texto.
    // scripts/bench-quadro.ts em 2026-11-09: gemma-4-26B-A4B (Featherless) 7/8 simulações, p50 3–4 s,
    // ~US$ 0,0005 por análise; gemini-3.7-flash 8/8, ~US$ 0,0055; GLM-5.3-Flash 2/3 com p50 5,3 s;
    // Mistral-Small-3.2, Qwen3.6-35B e gemma-4-31B estouravam o prazo. O gemini entra se a Featherless passar de 6 s.
    featherlessEnv: "ANALISE_QUADRO_FEATHERLESS_MODEL",
    featherlessDefault: "google/gemma-4-26B-A4B-it",
    openrouterEnv: "ANALISE_QUADRO_MODEL",
    openrouterDefault: "google/gemini-3.7-flash",
    maxTokens: 4000,
    reasoningEffort: "low",
    raciocinioSo: "openrouter",
    hedgeMs: 6_000,
    temperatura: 0.4,
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
  /** Chamadas e custo do papel, por provedor (inclui as perdedoras do hedge, que também são cobradas). */
  uso?: Record<LlmProviderName, { calls: number; costUsd: number }>;
}

function usoDoPapel(r: RoleStore): NonNullable<RoleStore["uso"]> {
  return (r.uso ??= { featherless: { calls: 0, costUsd: 0 }, openrouter: { calls: 0, costUsd: 0 } });
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
    conversa_quadro: { consecutiveSlow: 0 },
    fast: { consecutiveSlow: 0 },
    filtro: { consecutiveSlow: 0 },
    evaluator: { consecutiveSlow: 0 },
    relatorio: { consecutiveSlow: 0 },
    interviewer: { consecutiveSlow: 0 },
    quadro: { consecutiveSlow: 0 },
    codigo: { consecutiveSlow: 0 },
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
  /** Chamadas e custo (USD informado pelo provedor) por provedor, desde que o processo subiu. */
  uso: Record<LlmProviderName, { calls: number; costUsd: number }>;
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
  const uso = structuredClone(usoDoPapel(r));
  if (!breakerActive(r, now) || r.directUntil === undefined) return { route: primario, uso };
  return { route: reserva, directUntil: r.directUntil, uso };
}

/** [primário, reserva] do papel. `LLM_PRIMARIO_<PAPEL>` (featherless|openrouter) troca o primário sem deploy de código. */
function ordem(role: LlmRole): [LlmProviderName, LlmProviderName] {
  const env = process.env[`LLM_PRIMARIO_${role.toUpperCase()}`];
  const primario = env === "openrouter" || env === "featherless" ? env : ROLE_CONFIG[role].primario;
  return primario === "openrouter" ? ["openrouter", "featherless"] : ["featherless", "openrouter"];
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
      conversa_quadro: roleSnapshot("conversa_quadro", state.roles.conversa_quadro, now),
      fast: roleSnapshot("fast", state.roles.fast, now),
      filtro: roleSnapshot("filtro", state.roles.filtro, now),
      evaluator: roleSnapshot("evaluator", state.roles.evaluator, now),
      relatorio: roleSnapshot("relatorio", state.roles.relatorio, now),
      interviewer: roleSnapshot("interviewer", state.roles.interviewer, now),
      quadro: roleSnapshot("quadro", state.roles.quadro, now),
      codigo: roleSnapshot("codigo", state.roles.codigo, now),
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
async function attempt<T>(role: LlmRole, provider: ProviderConfig, req: ChatRequest<T>): Promise<ChatJsonResult<T>> {
  const stats = state.providers[provider.name];
  const doPapel = usoDoPapel(state.roles[role])[provider.name];
  stats.calls += 1;
  doPapel.calls += 1;
  const started = Date.now();
  try {
    const result = await chatJsonVia(provider, req);
    stats.costUsd += result.costUsd;
    doPapel.costUsd += result.costUsd;
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
    if (err instanceof LlmProviderError) {
      stats.costUsd += err.costUsd;
      doPapel.costUsd += err.costUsd;
    }
    throw err;
  }
}

// ---- Roteamento ----

interface RoleCall<T> {
  role: LlmRole;
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
    return { ok: true, value: await attempt(call.role, PROVIDERS[name], requestFor(call, name, signal)) };
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
  const result = await attempt(call.role, PROVIDERS[name], requestFor(call, name, signal));
  recordWin(name);
  return result;
}

export async function completeJson<T>(opts: {
  role: LlmRole;
  /** Sistema fixo entre chamadas (vai para o cache do provedor no OpenRouter). */
  system: string;
  /** Parte do sistema que muda a cada chamada (fora do cache). */
  systemDinamico?: string;
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
  /** Imagem que acompanha o pedido (data URL). Só vai ao OpenRouter; sem ela, nada muda. */
  imageDataUrl?: string | null;
}): Promise<ChatJsonResult<T>> {
  const cfg = ROLE_CONFIG[opts.role];
  const fala = PAPEIS_DE_FALA.has(opts.role);
  const call: RoleCall<T> = {
    role: opts.role,
    base: {
      system: opts.system,
      ...(opts.systemDinamico ? { systemDinamico: opts.systemDinamico } : {}),
      user: opts.user,
      schema: opts.schema,
      maxTokens: opts.maxTokens ?? cfg.maxTokens,
      ...(cfg.temperatura !== undefined ? { temperature: cfg.temperatura } : {}),
      ...(cfg.tempoPorTentativaMs !== undefined ? { tempoPorTentativaMs: cfg.tempoPorTentativaMs } : {}),
      priorizarLatencia: fala,
      prioridade: fala ? "fala" : "fundo",
      ...(opts.prazoMs !== undefined ? { prazoAte: Date.now() + opts.prazoMs } : {}),
      ...(opts.imageDataUrl ? { imageDataUrl: opts.imageDataUrl } : {}),
    },
    models: {
      featherless: process.env[cfg.featherlessEnv] || cfg.featherlessDefault,
      openrouter: process.env[cfg.openrouterEnv] || cfg.openrouterDefault,
    },
    reasoning: raciocinio(opts.role, cfg),
  };

  // Sem chave do OpenRouter: comportamento de antes, só Featherless.
  if (!process.env.OPENROUTER_API_KEY) return callOnly(call, "featherless", opts.signal);
  // Sem chave da Featherless: só OpenRouter. Sem isso, duas lentidões do OpenRouter abriam o disjuntor e
  // mandavam tudo para a Featherless (que falha na hora) por minutos.
  if (!process.env.FEATHERLESS_API_KEY) return callOnly(call, "openrouter", opts.signal);
  if (breakerIsOpen(opts.role)) return callOnly(call, ordem(opts.role)[1], opts.signal);
  const hedgeMs = hedgeDoPapel(opts.role, cfg);
  if (hedgeMs === undefined) return callWithFallback(opts.role, call, opts.signal);
  return callHedged(opts.role, call, hedgeMs, opts.signal);
}

/**
 * `reasoningEffort` por provedor. `LLM_RACIOCINIO_<PAPEL>` (nenhum|low|medium|high) troca o do papel sem deploy de
 * código, para os dois provedores (usado pelos benchmarks para comparar modelos de famílias diferentes).
 */
function raciocinio(role: LlmRole, cfg: RoleConfig): Record<LlmProviderName, ReasoningEffort | undefined> {
  const env = process.env[`LLM_RACIOCINIO_${role.toUpperCase()}`];
  if (env === "nenhum") return { featherless: undefined, openrouter: undefined };
  if (env === "low" || env === "medium" || env === "high") return { featherless: env, openrouter: env };
  return {
    featherless: !cfg.raciocinioSo || cfg.raciocinioSo === "featherless" ? cfg.reasoningEffort : undefined,
    openrouter: !cfg.raciocinioSo || cfg.raciocinioSo === "openrouter" ? cfg.reasoningEffort : undefined,
  };
}

/**
 * Ms até a reserva correr junto. `LLM_HEDGE_<PAPEL>` troca sem deploy (ms; "0" = sem hedge, só em erro). Ex.: o
 * relatório (papel "relatorio") leva ~3 min no GLM-5.2 da Featherless; com função mais longa na Vercel, dá para
 * dar ainda mais tempo a ela antes de o OpenRouter entrar.
 */
function hedgeDoPapel(role: LlmRole, cfg: RoleConfig): number | undefined {
  const env = process.env[`LLM_HEDGE_${role.toUpperCase()}`];
  if (env === undefined || env.trim() === "" || !Number.isFinite(Number(env))) return cfg.hedgeMs;
  return Number(env) > 0 ? Number(env) : undefined;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
