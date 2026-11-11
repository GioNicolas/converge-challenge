import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { limparCacheUrlPublica, resolverUrlPublica, verificarUrlPublica } from "../url";

afterEach(() => limparCacheUrlPublica());

describe("urlPublica", () => {
  it("usa APP_URL válida e remove a barra final", () => {
    assert.equal(resolverUrlPublica({ APP_URL: "https://totti.ia.br/", NODE_ENV: "production" }, "https://deploy.example"), "https://totti.ia.br");
  });

  it("usa a origem quando APP_URL não está definida", () => {
    assert.equal(resolverUrlPublica({ NODE_ENV: "development" }, "http://localhost:3000"), "http://localhost:3000");
  });

  it("aceita localhost em HTTP durante desenvolvimento", () => {
    assert.equal(resolverUrlPublica({ APP_URL: "http://localhost:3000/", NODE_ENV: "development" }, "http://127.0.0.1:3000"), "http://localhost:3000");
  });

  it("rejeita localhost e preview Vercel como origem em produção", () => {
    for (const origem of ["http://localhost:3000", "https://127.0.0.1", "https://preview.vercel.app"]) {
      assert.throws(() => resolverUrlPublica({ NODE_ENV: "production" }, origem), /URL pública inválida em produção/);
    }
  });

  it("rejeita APP_URL localhost e domínio Vercel em produção", () => {
    for (const APP_URL of ["https://localhost:3000", "https://preview.vercel.app"]) {
      assert.throws(() => resolverUrlPublica({ APP_URL, NODE_ENV: "production" }, "https://totti.ia.br"), /URL pública inválida em produção/);
    }
  });

  it("ignora APP_URL HTTP em produção e usa a origem HTTPS", () => {
    assert.equal(resolverUrlPublica({ NODE_ENV: "production", VERCEL_ENV: "preview" }, "https://x-git-a.vercel.app"), "https://x-git-a.vercel.app");
    assert.throws(() => resolverUrlPublica({ NODE_ENV: "production", VERCEL_ENV: "production" }, "https://x.vercel.app"), /URL pública inválida em produção/);
    assert.equal(resolverUrlPublica({ APP_URL: "http://antigo.example", NODE_ENV: "production" }, "https://totti.ia.br"), "https://totti.ia.br");
  });
});

describe("verificarUrlPublica", () => {
  it("considera vivo qualquer status abaixo de 500 e usa HEAD manual", async () => {
    let chamada: [string | URL, RequestInit | undefined] | undefined;
    const fetchFake = async (url: string | URL, init?: RequestInit) => {
      chamada = [url, init];
      return new Response(null, { status: 404 });
    };
    const resultado = await verificarUrlPublica("https://totti.ia.br", "https://deploy.example", fetchFake);
    assert.deepEqual(resultado, { vivo: true, host: "totti.ia.br" });
    assert.equal(String(chamada?.[0]), "https://totti.ia.br/agendar");
    assert.equal(chamada?.[1]?.method, "HEAD");
    assert.equal(chamada?.[1]?.redirect, "manual");
  });

  it("memoriza resultado negativo por host", async () => {
    let chamadas = 0;
    const fetchFake = async () => {
      chamadas++;
      return new Response(null, { status: 530 });
    };
    assert.equal((await verificarUrlPublica("https://morto.example", "https://deploy.example", fetchFake)).vivo, false);
    assert.equal((await verificarUrlPublica("https://morto.example/outra", "https://deploy.example", fetchFake)).vivo, false);
    assert.equal(chamadas, 1);
  });

  it("armazena falha de timeout como negativa", async () => {
    const fetchFake = (_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    });
    const resultado = await verificarUrlPublica("https://lento.example", "https://deploy.example", fetchFake);
    assert.equal(resultado.vivo, false);
  });
});
