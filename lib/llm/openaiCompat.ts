/**
 * Cliente genérico para APIs no formato OpenAI (chat/completions): Featherless e OpenRouter.
 * Cada provedor é um ProviderConfig; o pedido, os retries e o parse do JSON são compartilhados.
 */
import type { z } from "zod";

export type LlmProviderName = "featherless" | "openrouter";

export type ReasoningEffort = "low" | "medium" | "high";

export interface ChatJsonResult<T> {
  data: T;
  model: string;
  provider: LlmProviderName;
  durationMs: number;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
}

export interface ChatRequest<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  reasoningEffort?: ReasoningEffort;
  /** Cancela a chamada: para de esperar, aborta o fetch em voo e não faz retry. */
  signal?: AbortSignal;
}

export interface ExtraBodyOpts {
  reasoningEffort?: ReasoningEffort;
}

export interface ProviderConfig {
  name: LlmProviderName;
  endpoint: string;
  apiKeyEnv: string;
  /** Getter: o limite é lido a cada chamada, então muda com o env sem reiniciar. */
  readonly concurrency: number;
  buildExtraBody(opts: ExtraBodyOpts): Record<string, unknown>;
}

/** Falha de provedor já com o custo gasto até ali (retries e reparo também custam). */
export class LlmProviderError extends Error {
  readonly costUsd: number;

  constructor(message: string, costUsd: number) {
    super(message);
    this.name = "LlmProviderError";
    this.costUsd = costUsd;
  }
}

export function abortError(): Error {
  const err = new Error("chamada LLM abortada");
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 3_000];

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Completion {
  content: string;
  finishReason: string | null;
}

interface Totals {
  cost: number;
  prompt: number;
  completion: number;
}

type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

// Retriable failure (network, timeout, 429, 5xx). Anything else is thrown as a plain Error.
class RetryableError extends Error {}

// One FIFO semaphore per provider, on globalThis so Next dev hot reload doesn't duplicate it.
interface Semaphore {
  active: number;
  queue: Array<() => void>;
}
const globalWithSems = globalThis as typeof globalThis & {
  __llmSemaphores?: Map<LlmProviderName, Semaphore>;
};
const semaphores = (globalWithSems.__llmSemaphores ??= new Map<LlmProviderName, Semaphore>());

function semaphoreFor(name: LlmProviderName): Semaphore {
  let sem = semaphores.get(name);
  if (!sem) {
    sem = { active: 0, queue: [] };
    semaphores.set(name, sem);
  }
  return sem;
}

// Takes a slot, or waits in FIFO order. A waiter that gets aborted leaves the queue.
function acquire(sem: Semaphore, limit: number, signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (sem.active < limit && sem.queue.length === 0) {
    sem.active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const grant = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const onAbort = () => {
      const i = sem.queue.indexOf(grant);
      if (i >= 0) sem.queue.splice(i, 1);
      reject(abortError());
    };
    sem.queue.push(grant);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function withSlot<R>(
  provider: ProviderConfig,
  signal: AbortSignal | undefined,
  fn: () => Promise<R>,
): Promise<R> {
  const sem = semaphoreFor(provider.name);
  await acquire(sem, provider.concurrency, signal);
  try {
    return await fn();
  } finally {
    // Hand the slot straight to the next waiter (active count unchanged), or free it.
    const next = sem.queue.shift();
    if (next) next();
    else sem.active--;
  }
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function addUsage(totals: Totals, payload: unknown): void {
  if (!isRecord(payload) || !isRecord(payload.usage)) return;
  totals.cost += num(payload.usage.cost);
  totals.prompt += num(payload.usage.prompt_tokens);
  totals.completion += num(payload.usage.completion_tokens);
}

/** Provedor que de fato atendeu (OpenRouter informa; Featherless não). */
function upstreamOf(payload: unknown): string | undefined {
  return isRecord(payload) && typeof payload.provider === "string" ? payload.provider : undefined;
}

function readCompletion(payload: unknown, providerName: string): Completion {
  const choices: unknown = isRecord(payload) ? payload.choices : undefined;
  const choice: unknown = Array.isArray(choices) ? choices[0] : undefined;
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw new Error(`resposta da ${providerName} sem choices[0].message`);
  }
  return {
    content: typeof choice.message.content === "string" ? choice.message.content : "",
    finishReason: typeof choice.finish_reason === "string" ? choice.finish_reason : null,
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

interface PostResult {
  completion: Completion;
  upstream?: string;
}

async function postOnce(
  provider: ProviderConfig,
  body: Record<string, unknown>,
  apiKey: string,
  totals: Totals,
  signal: AbortSignal | undefined,
): Promise<PostResult> {
  // Timeout and external cancel both abort the fetch; only the timeout is retriable.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const payload: unknown = parseJson(text);
    addUsage(totals, payload);

    if (!res.ok) {
      const snippet = text.slice(0, 300);
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError(`HTTP ${res.status}: ${snippet}`);
      }
      const hint = res.status === 403 ? " (modelo gated: sem acesso, não repetido)" : "";
      throw new Error(`${provider.name} HTTP ${res.status}${hint}: ${snippet}`);
    }
    if (payload === undefined) throw new Error(`resposta 2xx da ${provider.name} não é JSON`);
    return { completion: readCompletion(payload, provider.name), upstream: upstreamOf(payload) };
  } catch (err) {
    if (signal?.aborted) throw abortError();
    if (err instanceof RetryableError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new RetryableError(`timeout após ${TIMEOUT_MS / 1000}s`);
    }
    if (err instanceof TypeError) {
      // fetch() rejects with TypeError on network failure
      throw new RetryableError(`erro de rede: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

// Sends one logical request, retrying retriable failures with backoff.
async function callApi(
  provider: ProviderConfig,
  body: Record<string, unknown>,
  apiKey: string,
  totals: Totals,
  signal: AbortSignal | undefined,
): Promise<PostResult> {
  const model = String(body.model);
  for (let attempt = 1; ; attempt++) {
    try {
      return await withSlot(provider, signal, () => postOnce(provider, body, apiKey, totals, signal));
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt >= MAX_ATTEMPTS) throw err;
      const wait = BACKOFF_MS[attempt - 1];
      console.warn(
        `[${provider.name}] ${model} tentativa ${attempt}/${MAX_ATTEMPTS} falhou (${err.message}); nova tentativa em ${wait}ms`,
      );
      await sleep(wait, signal);
    }
  }
}

function parseContent<T>(c: Completion, schema: z.ZodType<T>): Parsed<T> {
  if (c.content.trim() === "" && c.finishReason === "length") {
    throw new Error("resposta vazia: modelo gastou os tokens raciocinando (aumente maxTokens)");
  }
  const body = c.content.replace(/```(?:json)?/gi, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) return { ok: false, error: "nenhum objeto JSON na resposta" };

  let json: unknown;
  try {
    json = JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch (err) {
    return { ok: false, error: `JSON inválido: ${errMsg(err)}` };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `schema: ${issues}` };
}

export async function chatJsonVia<T>(provider: ProviderConfig, req: ChatRequest<T>): Promise<ChatJsonResult<T>> {
  const apiKey = process.env[provider.apiKeyEnv];
  if (!apiKey) throw new Error(`${provider.apiKeyEnv} não definida (confira .env.local)`);
  const extra = provider.buildExtraBody({ reasoningEffort: req.reasoningEffort });
  const baseBody = { model: req.model, max_tokens: req.maxTokens, ...extra };

  const started = Date.now();
  const totals: Totals = { cost: 0, prompt: 0, completion: 0 };
  const messages: ChatMessage[] = [
    { role: "system", content: req.system },
    { role: "user", content: req.user },
  ];

  let upstream: string | undefined;
  const call = async (msgs: ChatMessage[]): Promise<Completion> => {
    const result = await callApi(provider, { ...baseBody, messages: msgs }, apiKey, totals, req.signal);
    upstream = result.upstream ?? upstream;
    return result.completion;
  };

  try {
    const first = await call(messages);
    let parsed = parseContent(first, req.schema);

    if (!parsed.ok) {
      // One repair attempt: show the model its bad answer and the error.
      const error = parsed.error.slice(0, 300);
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: first.content },
        {
          role: "user",
          content: `Sua resposta não é um JSON válido no formato pedido. Erro: ${error}. Responda de novo SOMENTE com o objeto JSON corrigido.`,
        },
      ];
      const second = await call(repairMessages);
      parsed = parseContent(second, req.schema);
      if (!parsed.ok) throw new Error(`resposta inválida após reparo: ${parsed.error}`);
    }

    const durationMs = Date.now() - started;
    const via = upstream ? ` via ${upstream}` : "";
    console.log(
      `[${provider.name}] ${req.model}${via} ${durationMs}ms in=${totals.prompt} out=${totals.completion} $${totals.cost.toFixed(4)}`,
    );
    return {
      data: parsed.data,
      model: req.model,
      provider: provider.name,
      durationMs,
      costUsd: totals.cost,
      promptTokens: totals.prompt,
      completionTokens: totals.completion,
    };
  } catch (err) {
    if (req.signal?.aborted) throw abortError();
    throw new LlmProviderError(errMsg(err), totals.cost);
  }
}
