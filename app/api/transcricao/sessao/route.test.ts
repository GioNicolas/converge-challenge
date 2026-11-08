import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "./route";

test("rota usa navegador sem chave e bloqueia origens externas", async () => {
  const anterior = process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_API_KEY;
  try {
    const resposta = await POST(new Request("http://localhost:3003/api/transcricao/sessao", { method: "POST" }));
    assert.deepEqual(await resposta.json(), { provedor: "navegador" });
    assert.equal(resposta.headers.get("cache-control"), "no-store");
    const externa = await POST(new Request("http://localhost:3003/api/transcricao/sessao", {
      method: "POST", headers: { origin: "https://outro.example" },
    }));
    assert.equal(externa.status, 403);
  } finally {
    if (anterior === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = anterior;
  }
});

test("rota entrega só token temporário e não revela chave ou erro do provedor", async () => {
  const anterior = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "segredo-servidor";
  const fetchAnterior = globalThis.fetch;
  const request = () => new Request("http://localhost:3003/api/transcricao/sessao", { method: "POST", headers: { origin: "http://localhost:3003" } });
  try {
    globalThis.fetch = async (url, opcoes) => {
      assert.equal(url, "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe");
      assert.equal(new Headers(opcoes?.headers).get("xi-api-key"), "segredo-servidor");
      return Response.json({ token: "temporario" });
    };
    const resposta = await POST(request());
    assert.deepEqual(await resposta.json(), { provedor: "elevenlabs", token: "temporario" });
    globalThis.fetch = async () => new Response("erro com segredo-servidor", { status: 401 });
    const falha = await POST(request());
    assert.equal(falha.status, 502);
    assert.doesNotMatch(await falha.text(), /segredo-servidor/);
    globalThis.fetch = async () => Response.json({ token: 123 });
    assert.equal((await POST(request())).status, 502);
  } finally {
    globalThis.fetch = fetchAnterior;
    if (anterior === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = anterior;
  }
});
