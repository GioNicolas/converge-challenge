import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iguaisEmTempoConstante, senhaDoBasic, validarAcesso, valorDoCookie } from "../acesso";

const basic = (usuario: string, senha: string) => `Basic ${Buffer.from(`${usuario}:${senha}`).toString("base64")}`;

describe("iguaisEmTempoConstante", () => {
  it("só é verdadeiro para textos iguais", () => {
    assert.equal(iguaisEmTempoConstante("abc", "abc"), true);
    assert.equal(iguaisEmTempoConstante("abc", "abd"), false);
    assert.equal(iguaisEmTempoConstante("abc", "abcd"), false);
    assert.equal(iguaisEmTempoConstante("", ""), true);
    assert.equal(iguaisEmTempoConstante("", "x"), false);
  });
});

describe("senhaDoBasic", () => {
  it("lê a senha e ignora o usuário (que pode ter dois-pontos na senha)", () => {
    assert.equal(senhaDoBasic(basic("qualquer", "s3nha")), "s3nha");
    assert.equal(senhaDoBasic(basic("", "s3nha")), "s3nha");
    assert.equal(senhaDoBasic(basic("u", "a:b:c")), "a:b:c");
  });
  it("aceita 'basic' em minúsculas e acentos na senha", () => {
    assert.equal(senhaDoBasic(basic("u", "açaí").replace("Basic", "basic")), "açaí");
  });
  it("devolve undefined para o que não é Basic ou vem torto", () => {
    assert.equal(senhaDoBasic(null), undefined);
    assert.equal(senhaDoBasic("Bearer abc"), undefined);
    assert.equal(senhaDoBasic("Basic"), undefined);
    assert.equal(senhaDoBasic("Basic ###"), undefined);
    assert.equal(senhaDoBasic(`Basic ${Buffer.from("sem-dois-pontos").toString("base64")}`), undefined);
  });
});

describe("validarAcesso", () => {
  it("sem PAINEL_SENHA o painel está aberto e não grava cookie", async () => {
    assert.deepEqual(await validarAcesso(undefined, { authorization: null, cookie: undefined }), { liberado: true, gravarCookie: false });
    assert.deepEqual(await validarAcesso("", { authorization: null, cookie: undefined }), { liberado: true, gravarCookie: false });
  });

  it("senha certa no Basic libera e manda gravar o cookie", async () => {
    const r = await validarAcesso("segredo", { authorization: basic("x", "segredo"), cookie: undefined });
    assert.deepEqual(r, { liberado: true, gravarCookie: true });
  });

  it("senha errada ou ausente bloqueia", async () => {
    assert.equal((await validarAcesso("segredo", { authorization: basic("x", "errada"), cookie: undefined })).liberado, false);
    assert.equal((await validarAcesso("segredo", { authorization: null, cookie: undefined })).liberado, false);
  });

  it("o cookie certo libera sem regravar; um cookie qualquer, ou de outra senha, não", async () => {
    const cookie = await valorDoCookie("segredo");
    assert.deepEqual(await validarAcesso("segredo", { authorization: null, cookie }), { liberado: true, gravarCookie: false });
    assert.equal((await validarAcesso("segredo", { authorization: null, cookie: "qualquer" })).liberado, false);
    assert.equal((await validarAcesso("outra", { authorization: null, cookie })).liberado, false);
  });

  it("o cookie nunca contém a senha", async () => {
    const cookie = await valorDoCookie("segredo");
    assert.match(cookie, /^[0-9a-f]{64}$/);
    assert.ok(!cookie.includes("segredo"));
  });
});
