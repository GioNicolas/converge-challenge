// Ordem dos alvos, fila da Featherless com prioridade e o `chat` passando por ela.
// Sem rede: o fetch é falso, e a chave da Featherless é só do processo do teste.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filaDoProvedor, comVagaNoProvedor } from "@/lib/llm/openaiCompat";
import { alvosDoExtrator } from "../extrator";
import { ALVOS as ALVOS_COMPETENCIAS } from "../competencias";
import { alvosDaConversa } from "../conversa";
import { chat, type Alvo } from "../llm";

/** Restaura as variáveis de ambiente no fim do teste (valor antigo ou ausente). */
function fixarEnv(t: { after(fn: () => void): void }, valores: Record<string, string | undefined>) {
  const antes = Object.fromEntries(Object.keys(valores).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(valores)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

const esperar = (ms = 10) => new Promise((r) => setTimeout(r, ms));

/** Nenhum alvo da OpenRouter vem antes de um alvo da Featherless. (Só a lista; nada é chamado.) */
function featherlessAntesDaOpenrouter(alvos: Alvo[]): boolean {
  const ultimoFeatherless = alvos.map((a) => a.provedor).lastIndexOf("featherless");
  const primeiroOpenrouter = alvos.findIndex((a) => a.provedor === "openrouter");
  return primeiroOpenrouter === -1 || ultimoFeatherless < primeiroOpenrouter;
}

test("extrator: nenhuma OpenRouter antes de uma Featherless (padrão e com EXTRACTOR_MODEL)", (t) => {
  fixarEnv(t, { EXTRACTOR_MODEL: undefined, EXTRACTOR_FALLBACK_MODEL: undefined });
  assert.ok(featherlessAntesDaOpenrouter(alvosDoExtrator()));
  assert.equal(alvosDoExtrator().at(-1)?.provedor, "openrouter", "a OpenRouter é a última reserva");

  fixarEnv(t, { EXTRACTOR_MODEL: "google/gemma-4-26B-A4B-it" });
  const alvos = alvosDoExtrator();
  assert.ok(featherlessAntesDaOpenrouter(alvos));
  assert.equal(alvos[0].model, "google/gemma-4-26B-A4B-it", "EXTRACTOR_MODEL vira a primária");
  assert.equal(alvos[1].provedor, "featherless", "a outra Featherless vem em seguida");
  assert.notEqual(alvos[1].model, alvos[0].model);
});

test("extrator: o GLM sai com o raciocínio desligado, e só ele", (t) => {
  fixarEnv(t, { EXTRACTOR_MODEL: undefined });
  const [primario, segundo] = alvosDoExtrator();
  assert.equal(primario.model, "zai-org/GLM-5.2");
  assert.deepEqual(primario.extraBody, { chat_template_kwargs: { enable_thinking: false } });
  assert.equal(segundo.extraBody, undefined, "gemma não recebe o campo do GLM");
});

test("competências: Featherless primeiro, OpenRouter por último", () => {
  assert.ok(featherlessAntesDaOpenrouter(ALVOS_COMPETENCIAS));
  assert.equal(ALVOS_COMPETENCIAS[0].provedor, "featherless");
  assert.equal(ALVOS_COMPETENCIAS.at(-1)?.provedor, "openrouter");
});

test("conversa: Featherless primeiro, uma única reserva OpenRouter", (t) => {
  fixarEnv(t, { CONVERSA_FALLBACK_MODEL: undefined, CONVERSA_MODEL: undefined });
  const alvos = alvosDaConversa();
  assert.ok(featherlessAntesDaOpenrouter(alvos));
  assert.deepEqual(
    alvos.map((a) => [a.provedor, a.model]),
    [
      ["featherless", "google/gemma-4-26B-A4B-it"],
      ["openrouter", "google/gemini-2.5-flash-lite"],
    ],
  );
  assert.equal(alvos.filter((a) => a.provedor === "openrouter").length, 1, "uma reserva só");

  fixarEnv(t, { CONVERSA_FALLBACK_MODEL: "google/gemini-3.5-flash-lite", CONVERSA_MODEL: "outro/modelo" });
  const trocados = alvosDaConversa();
  assert.equal(trocados[0].model, "outro/modelo", "CONVERSA_MODEL troca o da Featherless");
  assert.equal(trocados[1].model, "google/gemini-3.5-flash-lite", "CONVERSA_FALLBACK_MODEL troca o da OpenRouter");
});

test("corpo do pedido: OpenRouter com gemini fixa o Google AI Studio; outros modelos e a Featherless não", async (t) => {
  fixarEnv(t, { OPENROUTER_API_KEY: "chave-ficticia", FEATHERLESS_API_KEY: "chave-ficticia" });
  const enviados: Array<{ url: string; corpo: { provider?: unknown; messages: Array<{ content: unknown }> } }> = [];
  t.mock.method(globalThis, "fetch", (url: unknown, opcoes?: RequestInit) => {
    enviados.push({ url: String(url), corpo: JSON.parse(String(opcoes?.body)) });
    return Promise.resolve(Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] }));
  });
  // Prompt de sistema longo (como o da conversa, ~6,9 mil caracteres): no OpenRouter vai marcado para o cache.
  const messages = [
    { role: "system" as const, content: "s".repeat(5_000) },
    { role: "user" as const, content: "oi" },
  ];
  await chat({ alvos: [{ provedor: "openrouter", model: "google/gemini-3.5-flash-lite", timeoutMs: 5_000 }], messages });
  await chat({ alvos: [{ provedor: "openrouter", model: "openai/gpt-4o-mini", timeoutMs: 5_000 }], messages });
  await chat({ alvos: [{ provedor: "featherless", model: "google/gemma-4-26B-A4B-it", timeoutMs: 5_000 }], messages });

  const [gemini, outro, featherless] = enviados;
  assert.deepEqual(gemini.corpo.provider, { order: ["google-ai-studio"], allow_fallbacks: true });
  assert.ok(Array.isArray(gemini.corpo.messages[0].content), "cache_control no prompt de sistema do OpenRouter");
  assert.equal(outro.corpo.provider, undefined, "só o gemini é fixado");
  assert.equal(featherless.corpo.provider, undefined, "a Featherless não recebe o campo do OpenRouter");
  assert.equal(typeof featherless.corpo.messages[0].content, "string", "Featherless: sistema em texto simples");
});

test("fila: fundo nunca ocupa as duas vagas, e a fala passa na frente de fundo que já esperava", async (t) => {
  fixarEnv(t, { FEATHERLESS_CONCURRENCY: "2" });
  const ordem: string[] = [];
  const soltar = new Map<string, () => void>();
  const tarefa = (nome: string, prioridade: "fala" | "fundo") =>
    comVagaNoProvedor("featherless", prioridade, () => {
      ordem.push(nome);
      return new Promise<void>((resolve) => soltar.set(nome, resolve));
    });

  // Duas vagas: uma fala e um fundo ocupando.
  const a = tarefa("fala-a", "fala");
  const b = tarefa("fundo-b", "fundo");
  await esperar();
  assert.deepEqual(ordem, ["fala-a", "fundo-b"]);

  // Chegam, nesta ordem, um fundo e depois uma fala: as duas esperam.
  const c = tarefa("fundo-c", "fundo");
  const d = tarefa("fala-d", "fala");
  await esperar();
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 2, fundo: 1, esperando: 2 });

  // Libera o fundo que ocupava vaga: a fala d entra antes do fundo c, mesmo tendo chegado depois.
  soltar.get("fundo-b")?.();
  await esperar();
  assert.deepEqual(ordem, ["fala-a", "fundo-b", "fala-d"]);
  assert.equal(filaDoProvedor("featherless").fundo, 0);

  // O fundo c só entra quando sobra vaga sem tirar a última: com a fala d ocupando uma, ele espera; sem ela, entra.
  soltar.get("fala-d")?.();
  await esperar();
  assert.deepEqual(ordem, ["fala-a", "fundo-b", "fala-d", "fundo-c"]);
  assert.ok(filaDoProvedor("featherless").fundo <= 1);

  for (const liberar of soltar.values()) liberar();
  await Promise.all([a, b, c, d]);
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 0, fundo: 0, esperando: 0 });
});

test("fila: sozinho, fundo ocupa uma vaga por vez", async (t) => {
  fixarEnv(t, { FEATHERLESS_CONCURRENCY: "2" });
  const soltar: Array<() => void> = [];
  const tarefa = () => comVagaNoProvedor("featherless", "fundo", () => new Promise<void>((resolve) => soltar.push(resolve)));
  const todas = [tarefa(), tarefa(), tarefa()];
  await esperar();
  assert.equal(filaDoProvedor("featherless").ativas, 1, "a segunda vaga fica livre para uma fala");
  assert.equal(filaDoProvedor("featherless").esperando, 2);
  for (let i = 0; i < 3; i++) {
    await esperar();
    assert.equal(filaDoProvedor("featherless").ativas, 1);
    soltar[i]?.();
  }
  await Promise.all(todas);
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 0, fundo: 0, esperando: 0 });
});

/**
 * `fetch` falso: a Featherless fica pendente até ser liberada ou abortada; a OpenRouter responde na hora.
 * Guarda cada pedido, com o sinal, para o teste ver quando saiu.
 */
function fetchFalso(t: { mock: { method: typeof import("node:test").mock.method } }) {
  const pedidos: Array<{ id: string; url: "featherless" | "openrouter"; sinal: AbortSignal; liberar: () => void }> = [];
  const resposta = () => Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] });
  t.mock.method(globalThis, "fetch", (url: unknown, opcoes?: RequestInit) => {
    const sinal = opcoes?.signal as AbortSignal;
    const id = (JSON.parse(String(opcoes?.body)) as { messages: { content: string }[] }).messages[1].content;
    if (String(url).includes("openrouter")) {
      pedidos.push({ id, url: "openrouter", sinal, liberar: () => {} });
      return Promise.resolve(resposta());
    }
    return new Promise<Response>((resolve, reject) => {
      sinal.addEventListener("abort", () => reject(Object.assign(new Error("abortado"), { name: "AbortError" })), { once: true });
      pedidos.push({ id, url: "featherless", sinal, liberar: () => resolve(resposta()) });
    });
  });
  return pedidos;
}

const alvoFeatherless: Alvo = { provedor: "featherless", model: "modelo-teste", timeoutMs: 60 };
const mensagens = (id: string) => [
  { role: "system" as const, content: "sistema" },
  { role: "user" as const, content: id },
];
const fila = () => filaDoProvedor("featherless");

test("chat, fundo: espera na fila mais que o prazo e ainda sai com o sinal não abortado", async (t) => {
  fixarEnv(t, { FEATHERLESS_API_KEY: "chave-ficticia", FEATHERLESS_CONCURRENCY: "2" });
  const pedidos = fetchFalso(t);
  const falaX = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fala-x") });
  const fundoA = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fundo-a"), prioridade: "fundo" });
  await esperar();

  // Duas vagas ocupadas: fala-x e fundo-a. O fundo-b tem prazo de 60 ms, que não vale na fila de fundo.
  const fundoB = chat({ alvos: [alvoFeatherless], messages: mensagens("fundo-b"), prioridade: "fundo" });
  await esperar(120);
  assert.equal(pedidos.some((p) => p.id === "fundo-b"), false, "ainda na fila");

  pedidos.find((p) => p.id === "fala-x")?.liberar();
  await falaX;
  await esperar(); // fundo-a segue ocupando uma vaga: o fundo-b não pega a última
  assert.equal(pedidos.some((p) => p.id === "fundo-b"), false, "o fundo não pega a última vaga");

  pedidos.find((p) => p.id === "fundo-a")?.liberar();
  await fundoA;
  await esperar();
  const pedidoB = pedidos.find((p) => p.id === "fundo-b");
  assert.ok(pedidoB, "o fundo-b saiu quando a vaga abriu");
  assert.equal(pedidoB.sinal.aborted, false, "o prazo do fundo nasce no envio, não na fila");
  pedidoB.liberar();
  assert.equal((await fundoB).provedor, "featherless");
  assert.deepEqual(fila(), { ativas: 0, fundo: 0, esperando: 0 });
});

test("chat, fala: espera na fila menos que o prazo e ainda é atendida pela Featherless", async (t) => {
  fixarEnv(t, { FEATHERLESS_API_KEY: "chave-ficticia", FEATHERLESS_CONCURRENCY: "2" });
  const pedidos = fetchFalso(t);
  const falaX = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fala-x") });
  const fundoA = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fundo-a"), prioridade: "fundo" });
  await esperar();

  const falaY = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 2_000 }], messages: mensagens("fala-y") });
  await esperar(60);
  pedidos.find((p) => p.id === "fala-x")?.liberar();
  await falaX;
  await esperar();
  pedidos.find((p) => p.id === "fala-y")?.liberar();
  const r = await falaY;
  assert.equal(r.provedor, "featherless");
  assert.equal(r.tentativas.length, 1);
  assert.equal(r.tentativas[0].erro, undefined);

  pedidos.find((p) => p.id === "fundo-a")?.liberar();
  await fundoA;
  assert.deepEqual(fila(), { ativas: 0, fundo: 0, esperando: 0 });
});

test("chat, fala: estoura o prazo na fila, passa para a reserva e a Featherless não entra em descanso", async (t) => {
  fixarEnv(t, { FEATHERLESS_API_KEY: "chave-ficticia", OPENROUTER_API_KEY: "chave-ficticia", FEATHERLESS_CONCURRENCY: "2" });
  const pedidos = fetchFalso(t);
  const modelo = "modelo-fila-cheia";
  const falaX = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fala-x") });
  const fundoA = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fundo-a"), prioridade: "fundo" });
  await esperar();

  // Vagas cheias: a fala-y espera 60 ms na fila, estoura e cai na OpenRouter.
  const falaY = await chat({
    alvos: [
      { provedor: "featherless", model: modelo, timeoutMs: 60 },
      { provedor: "openrouter", model: "reserva", timeoutMs: 5_000 },
    ],
    messages: mensagens("fala-y"),
  });
  assert.equal(falaY.provedor, "openrouter");
  assert.equal(falaY.tentativas[0].provedor, "featherless");
  assert.match(falaY.tentativas[0].erro ?? "", /fila da Featherless cheia por \d+ ms/);
  assert.equal(pedidos.some((p) => p.id === "fala-y" && p.url === "featherless"), false, "a Featherless nunca recebeu a fala-y");
  assert.ok(pedidos.some((p) => p.id === "fala-y" && p.url === "openrouter"), "a fala caiu na reserva");

  // Libera as vagas: o mesmo alvo volta a ser tentado primeiro, sem ter ficado de descanso.
  pedidos.find((p) => p.id === "fala-x")?.liberar();
  await falaX;
  pedidos.find((p) => p.id === "fundo-a")?.liberar();
  await fundoA;
  await esperar();
  const seguinte = chat({
    alvos: [
      { provedor: "featherless", model: modelo, timeoutMs: 5_000 },
      { provedor: "openrouter", model: "reserva", timeoutMs: 5_000 },
    ],
    messages: mensagens("fala-z"),
  });
  await esperar();
  pedidos.find((p) => p.id === "fala-z")?.liberar();
  const z = await seguinte;
  assert.equal(z.provedor, "featherless", "o alvo não ficou de descanso");
  assert.deepEqual(fila(), { ativas: 0, fundo: 0, esperando: 0 });
});

test("chat, fala: 503 respeita o prazo do alvo antes de passar à reserva", async (t) => {
  fixarEnv(t, { FEATHERLESS_API_KEY: "chave-ficticia", OPENROUTER_API_KEY: "chave-ficticia" });
  const enviados: string[] = [];
  t.mock.method(globalThis, "fetch", (url: unknown) => {
    enviados.push(String(url));
    return Promise.resolve(
      String(url).includes("featherless")
        ? new Response("indisponível", { status: 503 })
        : Response.json({ choices: [{ message: { content: "reserva" } }] }),
    );
  });

  const inicio = Date.now();
  const resposta = await chat({
    alvos: [
      { provedor: "featherless", model: "modelo-503-prazo", timeoutMs: 50 },
      { provedor: "openrouter", model: "reserva-503-prazo", timeoutMs: 5_000 },
    ],
    messages: mensagens("503"),
  });
  assert.equal(resposta.provedor, "openrouter");
  assert.equal(enviados.filter((url) => url.includes("featherless")).length, 1);
  assert.ok(Date.now() - inicio < 1_500, "o retry não espera 2 s depois que o prazo termina");
});
