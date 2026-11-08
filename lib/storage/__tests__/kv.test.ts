import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { criarArquivosEmMemoria } from "../arquivos";
import { criarKvEmMemoria, definirKvParaTestes, kvPadrao, kvRemoto, supabaseConfigurado } from "../kv";

describe("kv em memória", () => {
  it("grava, lê cópia e apaga", async () => {
    const kv = criarKvEmMemoria();
    assert.equal(await kv.get("ns", "a"), null);
    const original = { n: 1, lista: [1, 2] };
    await kv.set("ns", "a", original);
    original.n = 99; // mexer no original não afeta o guardado
    const lido = await kv.get<{ n: number; lista: number[] }>("ns", "a");
    assert.deepEqual(lido, { n: 1, lista: [1, 2] });
    lido!.lista.push(3); // nem na cópia lida
    assert.deepEqual((await kv.get<{ lista: number[] }>("ns", "a"))!.lista, [1, 2]);
    await kv.delete("ns", "a");
    assert.equal(await kv.get("ns", "a"), null);
  });

  it("setIfAbsent só grava a primeira vez", async () => {
    const kv = criarKvEmMemoria();
    assert.equal(await kv.setIfAbsent("ns", "a", 1), true);
    assert.equal(await kv.setIfAbsent("ns", "a", 2), false);
    assert.equal(await kv.get("ns", "a"), 1);
  });

  it("list devolve só o namespace, do mais antigo ao mais novo (regravar renova)", async () => {
    const kv = criarKvEmMemoria();
    await kv.set("a", "x", 1);
    await kv.set("a", "y", 2);
    await kv.set("b", "z", 3);
    await kv.set("a", "x", 10); // x passa a ser o mais novo
    assert.deepEqual((await kv.list("a")).map((r) => [r.key, r.value]), [["y", 2], ["x", 10]]);
    assert.deepEqual(await kv.list("vazio"), []);
  });

  it("recusa namespace ou chave vazios", async () => {
    const kv = criarKvEmMemoria();
    await assert.rejects(kv.get("", "a"));
    await assert.rejects(kv.set("ns", "", 1));
  });
});

describe("arquivos em memória", () => {
  it("guarda cópia dos bytes", async () => {
    const a = criarArquivosEmMemoria();
    const bytes = new Uint8Array([1, 2, 3]);
    await a.salvar("s/1.png", bytes, "image/png");
    bytes[0] = 9;
    assert.deepEqual(await a.obter("s/1.png"), new Uint8Array([1, 2, 3]));
    assert.equal(await a.obter("s/2.png"), null);
  });
});

describe("seleção do armazenamento", () => {
  const original = { url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_ROLE_KEY, forca: process.env.ARMAZENAMENTO };
  afterEach(() => {
    const restaurar = (nome: string, valor: string | undefined) => (valor === undefined ? delete process.env[nome] : (process.env[nome] = valor));
    restaurar("SUPABASE_URL", original.url);
    restaurar("SUPABASE_SERVICE_ROLE_KEY", original.chave);
    restaurar("ARMAZENAMENTO", original.forca);
    definirKvParaTestes(null);
  });

  it("sem as variáveis: memória e nada remoto", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    definirKvParaTestes(null);
    assert.equal(supabaseConfigurado(), null);
    assert.equal(kvPadrao().nome, "memoria");
    assert.equal(kvRemoto(), null);
  });

  it("com as duas variáveis: Supabase", () => {
    process.env.SUPABASE_URL = "https://exemplo.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
    delete process.env.ARMAZENAMENTO;
    definirKvParaTestes(null);
    assert.equal(kvPadrao().nome, "supabase");
    assert.equal(kvRemoto()?.nome, "supabase");
  });

  it("ARMAZENAMENTO=memoria ignora o Supabase", () => {
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-teste";
    process.env.ARMAZENAMENTO = "memoria";
    definirKvParaTestes(null);
    assert.equal(supabaseConfigurado(), null);
    assert.equal(kvPadrao().nome, "memoria");
  });
});
