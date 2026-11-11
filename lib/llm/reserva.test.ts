import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { completeJson } from "./index";

const schema = z.object({ texto: z.string() });
const ok = () => Response.json({ choices: [{ message: { content: '{"texto":"ok"}' }, finish_reason: "stop" }], usage: {} });

function ambiente(t: { after(fn: () => void): void; mock: { method: typeof import("node:test").mock.method } }, fetch: typeof globalThis.fetch) {
  const chaves = ["FEATHERLESS_API_KEY", "OPENROUTER_API_KEY"] as const;
  const antes = Object.fromEntries(chaves.map((k) => [k, process.env[k]]));
  process.env.FEATHERLESS_API_KEY = "falsa";
  process.env.OPENROUTER_API_KEY = "falsa";
  t.mock.method(globalThis, "fetch", fetch);
  t.after(() => {
    for (const k of chaves) {
      const valor = antes[k];
      if (valor === undefined) delete process.env[k];
      else process.env[k] = valor;
    }
  });
}

test("semReserva espera o primário sem disparar hedge", async (t) => {
  let chamadas = 0;
  let liberar!: (r: Response) => void;
  ambiente(t, () => {
    chamadas += 1;
    return new Promise<Response>((resolve) => { liberar = resolve; });
  });
  const chamada = completeJson({ role: "quadro", system: "s", user: "u", schema, semReserva: true });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(chamadas, 1);
  liberar(ok());
  assert.equal((await chamada).data.texto, "ok");
  assert.equal(chamadas, 1);
});

test("semReserva usa reserva se o primário falhar", async (t) => {
  const modelos: string[] = [];
  ambiente(t, async (_input, init) => {
    const corpo = JSON.parse(String(init?.body)) as { model: string };
    modelos.push(corpo.model);
    return modelos.length === 1 ? Response.json({ error: { message: "falhou" } }, { status: 400 }) : ok();
  });
  const r = await completeJson({ role: "quadro", system: "s", user: "u", schema, semReserva: true });
  assert.equal(r.data.texto, "ok");
  assert.equal(modelos.length, 2);
  assert.notEqual(modelos[0], modelos[1]);
});

test("disjuntor aberto mantém quadro no primário; papel comum continua na rota direta", async (t) => {
  const modelos: string[] = [];
  const antes = { f: process.env.FEATHERLESS_API_KEY, o: process.env.OPENROUTER_API_KEY };
  process.env.FEATHERLESS_API_KEY = "falsa";
  process.env.OPENROUTER_API_KEY = "falsa";
  t.after(() => {
    if (antes.f === undefined) delete process.env.FEATHERLESS_API_KEY;
    else process.env.FEATHERLESS_API_KEY = antes.f;
    if (antes.o === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = antes.o;
  });
  // Força a abertura do disjuntor do quadro por duas falhas do primário.
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const corpo = JSON.parse(String(init?.body)) as { model: string };
    modelos.push(corpo.model);
    if (String(_input).includes("featherless")) {
      return Response.json({ error: { message: "falhou" } }, { status: 400 });
    }
    return ok();
  });
  for (let i = 0; i < 2; i += 1) await completeJson({ role: "quadro", system: "s", user: `q${i}`, schema });
  modelos.length = 0;
  await completeJson({ role: "quadro", system: "s", user: "q3", schema });
  assert.match(modelos[0], /gemma/i, "quadro tenta o primário primeiro");
  const reservaQuadro = modelos[1];
  modelos.length = 0;
  await completeJson({ role: "quadro", system: "s", user: "q4", schema });
  assert.equal(modelos[1], reservaQuadro, "com disjuntor aberto, reserva continua apenas após o hedge");

  modelos.length = 0;
  for (let i = 0; i < 2; i += 1) await completeJson({ role: "analyst", system: "s", user: `a${i}`, schema });
  const reservaAnalyst = modelos[1];
  modelos.length = 0;
  await completeJson({ role: "analyst", system: "s", user: "a2", schema });
  assert.equal(modelos[0], reservaAnalyst, "papel comum segue na reserva direta do disjuntor");
});
