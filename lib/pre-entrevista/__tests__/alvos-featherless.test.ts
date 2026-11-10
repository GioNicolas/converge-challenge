// Ordem dos alvos (Featherless antes da OpenRouter), fila da Featherless com prioridade e o `chat` passando por ela.
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

test("conversa: Featherless primeiro e no máximo uma OpenRouter de reserva", (t) => {
  fixarEnv(t, { CONVERSA_MODEL: undefined, CONVERSA_FALLBACK_MODEL: undefined });
  const alvos = alvosDaConversa();
  assert.ok(featherlessAntesDaOpenrouter(alvos));
  assert.equal(alvos[0].provedor, "featherless");
  assert.ok(alvos.filter((a) => a.provedor === "openrouter").length <= 1, "uma reserva só");
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

/** `fetch` falso: cada pedido fica pendente até ser liberado ou abortado; guarda o sinal de cada um. */
function fetchFalso(t: { mock: { method: typeof import("node:test").mock.method } }) {
  const pedidos: Array<{ id: string; sinal: AbortSignal; liberar: () => void }> = [];
  t.mock.method(globalThis, "fetch", (_url: unknown, opcoes?: RequestInit) => {
    const sinal = opcoes?.signal as AbortSignal;
    const id = (JSON.parse(String(opcoes?.body)) as { messages: { content: string }[] }).messages[1].content;
    return new Promise<Response>((resolve, reject) => {
      sinal.addEventListener("abort", () => reject(Object.assign(new Error("abortado"), { name: "AbortError" })), { once: true });
      pedidos.push({
        id,
        sinal,
        liberar: () => resolve(Response.json({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }] })),
      });
    });
  });
  return pedidos;
}

const alvoFeatherless: Alvo = { provedor: "featherless", model: "modelo-teste", timeoutMs: 60 };
const mensagens = (id: string) => [
  { role: "system" as const, content: "sistema" },
  { role: "user" as const, content: id },
];

test("chat: fundo não ocupa a última vaga e a fala passa na frente; espera na fila não gasta o timeout", async (t) => {
  fixarEnv(t, { FEATHERLESS_API_KEY: "chave-ficticia", FEATHERLESS_CONCURRENCY: "2" });
  const pedidos = fetchFalso(t);

  const fundoA = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fundo-a"), prioridade: "fundo" });
  const fundoB = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fundo-b"), prioridade: "fundo" });
  await esperar();
  assert.deepEqual(pedidos.map((p) => p.id), ["fundo-a"], "o segundo fundo espera: não pega a última vaga");

  // Fala pega a vaga livre na hora.
  const fala = chat({ alvos: [{ ...alvoFeatherless, timeoutMs: 5_000 }], messages: mensagens("fala") });
  await esperar();
  assert.deepEqual(pedidos.map((p) => p.id), ["fundo-a", "fala"]);
  assert.equal(filaDoProvedor("featherless").ativas, 2);
  assert.equal(filaDoProvedor("featherless").esperando, 1);

  // Uma terceira fala espera mais que o timeout do alvo (60 ms) na fila. Quando a vaga abre, o fetch sai com o
  // sinal ainda não abortado: o tempo na fila não conta contra o alvo.
  const tardia = chat({ alvos: [alvoFeatherless], messages: mensagens("fala-tardia") });
  await esperar(120);
  assert.equal(pedidos.some((p) => p.id === "fala-tardia"), false, "ainda na fila");
  pedidos.find((p) => p.id === "fala")?.liberar();
  await fala;
  await esperar();
  const pedidoTardio = pedidos.find((p) => p.id === "fala-tardia");
  assert.ok(pedidoTardio, "a fala tardia saiu quando a vaga abriu");
  assert.equal(pedidoTardio.sinal.aborted, false, "o timeout começa no envio, não na entrada na fila");
  pedidoTardio.liberar();
  assert.equal((await tardia).provedor, "featherless");

  pedidos.find((p) => p.id === "fundo-a")?.liberar();
  await esperar();
  pedidos.find((p) => p.id === "fundo-b")?.liberar();
  await Promise.all([fundoA, fundoB]);
  assert.deepEqual(filaDoProvedor("featherless"), { ativas: 0, fundo: 0, esperando: 0 });
});
