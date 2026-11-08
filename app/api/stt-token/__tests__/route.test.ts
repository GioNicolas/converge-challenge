import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import { criarRepositorioEmMemoria, type RepositorioSessoes } from "../../../../lib/agente/armazenamento";
import { definirContextoParaTestes } from "../../../../lib/agente/rotas/contexto";
import { estadoInicial } from "../../../../lib/agente/sessao/estado";
import { GET } from "../route";

const fetchOriginal = globalThis.fetch;
let repo: RepositorioSessoes;
let sessaoId: string;
let contadorIp = 0;

beforeEach(async () => {
  repo = criarRepositorioEmMemoria();
  definirContextoParaTestes({ repositorio: repo });
  sessaoId = (await repo.criar({ avaliacaoId: "a", candidatoId: "c", estado: estadoInicial() })).id;
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.ELEVENLABS_API_KEY;
  definirContextoParaTestes(null);
});

// Cada pedido usa um IP próprio para os testes não esgotarem o limite um do outro.
const pedido = (id: string | null = sessaoId, ip = `10.0.0.${++contadorIp}`) =>
  new NextRequest(`http://localhost/api/stt-token${id === null ? "" : `?sessao_id=${id}`}`, { headers: { "x-real-ip": ip } });

const fetchFalso = (calls: { n: number }) => {
  globalThis.fetch = (async () => { calls.n++; return Response.json({ token: "tk" }); }) as typeof fetch;
};

test("exige sessao_id", async () => {
  assert.equal((await GET(pedido(null))).status, 400);
});

test("sem chave configurada responde 503", async () => {
  assert.equal((await GET(pedido())).status, 503);
});

test("sessão inexistente responde 404 sem chamar o ElevenLabs", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  const calls = { n: 0 };
  fetchFalso(calls);
  assert.equal((await GET(pedido("nao-existe"))).status, 404);
  assert.equal(calls.n, 0);
});

test("sessão encerrada responde 409 sem chamar o ElevenLabs", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  const calls = { n: 0 };
  fetchFalso(calls);
  const id = (await repo.criar({ avaliacaoId: "a", candidatoId: "c", estado: { ...estadoInicial(), fase: "ENCERRADA" } })).id;
  assert.equal((await GET(pedido(id))).status, 409);
  assert.equal(calls.n, 0);
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

test("limita pedidos por sessão e por IP", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  const calls = { n: 0 };
  fetchFalso(calls);
  const porSessao: number[] = [];
  for (let i = 0; i < 21; i++) porSessao.push((await GET(pedido())).status);
  assert.deepEqual(porSessao.slice(0, 20), Array(20).fill(200));
  assert.equal(porSessao[20], 429);
  assert.equal(calls.n, 20);

  const ip = "192.168.9.9";
  const porIp: number[] = [];
  for (let i = 0; i < 31; i++) {
    const id = (await repo.criar({ avaliacaoId: "a", candidatoId: "c", estado: estadoInicial() })).id;
    porIp.push((await GET(pedido(id, ip))).status);
  }
  assert.equal(porIp[29], 200);
  assert.equal(porIp[30], 429);
});

test("falha do ElevenLabs vira 502", async () => {
  process.env.ELEVENLABS_API_KEY = "k";
  globalThis.fetch = (async () => new Response("x", { status: 401 })) as typeof fetch;
  assert.equal((await GET(pedido())).status, 502);
  globalThis.fetch = (async () => { throw new Error("rede"); }) as typeof fetch;
  assert.equal((await GET(pedido())).status, 502);
});
