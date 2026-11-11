import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { completeJson } from "./index";
test("pedido HTTP de conversa prioriza latência e relatório mantém throughput", async (t) => {
  const anterior = process.env.OPENROUTER_API_KEY;
  const primaria = process.env.FEATHERLESS_API_KEY;
  process.env.OPENROUTER_API_KEY = "chave-ficticia-de-teste";
  delete process.env.FEATHERLESS_API_KEY;
  t.after(() => {
    if (anterior === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = anterior;
    if (primaria !== undefined) process.env.FEATHERLESS_API_KEY = primaria;
  });
  const pedidos: { provider: { sort: string } }[] = [];
  t.mock.method(globalThis, "fetch", async (_url: Parameters<typeof fetch>[0], opcoes?: RequestInit) => {
    pedidos.push(JSON.parse(String(opcoes?.body)));
    return Response.json({ choices: [{ message: { content: '{"texto":"Resposta"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 7 } } });
  });
  for (const role of ["interviewer", "fast", "evaluator"] as const) {
    const r = await completeJson({ role, system: "Teste", user: "Teste", schema: z.object({ texto: z.string() }) });
    assert.equal(r.data.texto, "Resposta");
    if (role === "interviewer") assert.equal(r.cachedTokens, 7);
  }
  assert.deepEqual(pedidos.map((p) => p.provider.sort), ["latency", "latency", "throughput"]);
});

test("prompt de sistema grande vai para o cache no OpenRouter; na Featherless e no curto, texto simples", async () => {
  const { mensagemDeSistema } = await import("./openaiCompat");
  const grande = "x".repeat(5000);
  const or = mensagemDeSistema("openrouter", grande, "dinamico");
  assert.ok(Array.isArray(or.content));
  assert.deepEqual((or.content as { cache_control?: unknown }[]).map((p) => p.cache_control), [{ type: "ephemeral" }, undefined]);
  assert.equal(mensagemDeSistema("featherless", grande, "dinamico").content, `${grande}\n\ndinamico`);
  assert.equal(mensagemDeSistema("openrouter", "curto").content, "curto");
});

test("Gemini vai primeiro ao Google AI Studio (com reserva); outros modelos, sem ordem fixa", async () => {
  const { openrouter } = await import("./openrouter");
  const gemini = openrouter.buildExtraBody({ model: "google/gemini-3.5-flash-lite", priorizarLatencia: true }) as { provider: Record<string, unknown> };
  assert.deepEqual(gemini.provider.order, ["google-ai-studio"]);
  assert.equal(gemini.provider.allow_fallbacks, true);
  const glm = openrouter.buildExtraBody({ model: "z-ai/glm-5.2" }) as { provider: Record<string, unknown> };
  assert.equal(glm.provider.order, undefined);
});

test("relatório e evaluator: Featherless primeiro; a reserva na OpenRouter é o gemini-3.5-flash-lite", async (t) => {
  const chaves = ["OPENROUTER_API_KEY", "FEATHERLESS_API_KEY", "RELATORIO_FALLBACK_MODEL", "EVALUATOR_FALLBACK_MODEL"];
  const antes = Object.fromEntries(chaves.map((k) => [k, process.env[k]]));
  process.env.OPENROUTER_API_KEY = "chave-ficticia-de-teste";
  process.env.FEATHERLESS_API_KEY = "chave-ficticia-de-teste";
  delete process.env.RELATORIO_FALLBACK_MODEL;
  delete process.env.EVALUATOR_FALLBACK_MODEL;
  t.after(() => {
    for (const [k, v] of Object.entries(antes)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const pedidos: { host: string; model: string }[] = [];
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], opcoes?: RequestInit) => {
    const host = new URL(String(url)).host;
    pedidos.push({ host, model: JSON.parse(String(opcoes?.body)).model });
    // A Featherless cai na hora (400 não tem retry): a reserva entra no erro, sem esperar o hedge.
    if (host.includes("featherless")) return new Response('{"error":"fora do ar"}', { status: 400 });
    return Response.json({ choices: [{ message: { content: '{"texto":"Resposta"}' }, finish_reason: "stop" }], usage: {} });
  });
  for (const role of ["relatorio", "evaluator"] as const) {
    const r = await completeJson({ role, system: "Teste", user: "Teste", schema: z.object({ texto: z.string() }) });
    assert.equal(r.provider, "openrouter");
  }
  assert.deepEqual(pedidos, [
    { host: "api.featherless.ai", model: "zai-org/GLM-5.2" },
    { host: "openrouter.ai", model: "google/gemini-3.5-flash-lite" },
    { host: "api.featherless.ai", model: "zai-org/GLM-5.2" },
    { host: "openrouter.ai", model: "google/gemini-3.5-flash-lite" },
  ]);
});

test("disjuntor aberto marca como reserva o provedor que respondeu", async (t) => {
  const anterior = { openrouter: process.env.OPENROUTER_API_KEY, featherless: process.env.FEATHERLESS_API_KEY };
  process.env.OPENROUTER_API_KEY = "chave-ficticia-de-teste";
  process.env.FEATHERLESS_API_KEY = "chave-ficticia-de-teste";
  t.after(() => {
    if (anterior.openrouter === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = anterior.openrouter;
    if (anterior.featherless === undefined) delete process.env.FEATHERLESS_API_KEY;
    else process.env.FEATHERLESS_API_KEY = anterior.featherless;
  });
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0]) => {
    if (String(url).includes("featherless")) return new Response('{"error":"fora do ar"}', { status: 400 });
    return Response.json({ choices: [{ message: { content: '{"texto":"Reserva"}' }, finish_reason: "stop" }], usage: {} });
  });

  let resposta;
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    resposta = await completeJson({ role: "evaluator", system: "Teste", user: "Teste", schema: z.object({ texto: z.string() }) });
  }
  assert.equal(resposta?.provider, "openrouter");
  assert.equal(resposta?.reservaDisparada, true);
});
