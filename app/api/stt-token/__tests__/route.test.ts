import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { getOrCreateSession } from "@/lib/session/store";
import { GET } from "../route";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.ELEVENLABS_API_KEY;
});
// Cada teste usa um IP próprio: o limitador por IP é global ao módulo e um teste não pode consumir a cota de outro.
let ipSeq = 0;
const pedido = (query = "?sessao_id=s1", ip = `10.0.0.${++ipSeq}`) =>
  new NextRequest(`http://localhost/api/stt-token${query}`, { headers: { "x-real-ip": ip } });

getOrCreateSession("s1");

test("exige sessao_id", async () => {
  assert.equal((await GET(pedido(""))).status, 400);
});

test("sem chave configurada responde 503", async () => {
  assert.equal((await GET(pedido())).status, 503);
});

test("devolve o token e nunca a chave", async () => {
  process.env.ELEVENLABS_API_KEY = "chave-secreta";
  let cabecalho: string | null = null;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    cabecalho = new Headers(init?.headers).get("xi-api-key");
    return Response.json({ token: "tk" });
  }) as typeof fetch;
  const resposta = await GET(pedido());
  assert.equal(cabecalho, "chave-secreta");
  assert.deepEqual(await resposta.json(), { token: "tk" });
});

test("falha do ElevenLabs vira 502", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  globalThis.fetch = (async () => new Response("x", { status: 401 })) as typeof fetch;
  assert.equal((await GET(pedido())).status, 502);
  globalThis.fetch = (async () => { throw new Error("rede"); }) as typeof fetch;
  assert.equal((await GET(pedido())).status, 502);
});

test("sessão desconhecida responde 404 e não chama o ElevenLabs", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  let chamou = false;
  globalThis.fetch = (async () => { chamou = true; return Response.json({ token: "tk" }); }) as typeof fetch;
  assert.equal((await GET(pedido("?sessao_id=inexistente"))).status, 404);
  assert.equal(chamou, false);
});

test("sessão encerrada responde 409", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  getOrCreateSession("s-fim").ended = true;
  assert.equal((await GET(pedido("?sessao_id=s-fim"))).status, 409);
});

test("limita pedidos repetidos da mesma sessão (429)", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  getOrCreateSession("s-limite");
  globalThis.fetch = (async () => Response.json({ token: "tk" })) as typeof fetch;
  const status: number[] = [];
  const ip = "10.9.9.9";
  for (let i = 0; i < 21; i++) status.push((await GET(pedido("?sessao_id=s-limite", ip))).status);
  assert.equal(status[19], 200);
  assert.equal(status[20], 429);
});

test("teto global barra o gasto mesmo com muitas sessões e IPs diferentes (429)", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  let chamadas = 0;
  globalThis.fetch = (async () => { chamadas++; return Response.json({ token: "tk" }); }) as typeof fetch;
  let barrou = false;
  for (let i = 0; i < 400 && !barrou; i++) {
    getOrCreateSession(`s-global-${i}`);
    barrou = (await GET(pedido(`?sessao_id=s-global-${i}`))).status === 429;
  }
  assert.equal(barrou, true);
  assert.ok(chamadas <= 300);
});
