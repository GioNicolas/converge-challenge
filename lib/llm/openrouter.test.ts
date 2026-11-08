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
    return Response.json({ choices: [{ message: { content: '{"texto":"Resposta"}' }, finish_reason: "stop" }], usage: {} });
  });
  for (const role of ["interviewer", "fast", "evaluator"] as const) {
    const r = await completeJson({ role, system: "Teste", user: "Teste", schema: z.object({ texto: z.string() }) });
    assert.equal(r.data.texto, "Resposta");
  }
  assert.deepEqual(pedidos.map((p) => p.provider.sort), ["latency", "latency", "throughput"]);
});
