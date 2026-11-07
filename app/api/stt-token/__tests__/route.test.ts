import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../route";

const fetchOriginal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.ELEVENLABS_API_KEY;
});
const pedido = (query = "?sessao_id=s1") => new NextRequest(`http://localhost/api/stt-token${query}`);

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
