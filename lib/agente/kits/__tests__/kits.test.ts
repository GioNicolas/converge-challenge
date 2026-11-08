import { test } from "node:test";
import assert from "node:assert/strict";
import { Kit } from "../tipos";
import { KITS, obterKit, obterProblema, resolverAvaliacao, dadosPublicosDoProblema } from "../index";

const kits = Object.values(KITS);

test("todo kit passa no schema Zod", () => {
  for (const kit of kits) assert.doesNotThrow(() => Kit.parse(kit), kit.id);
});

test("ids únicos de kits, problemas e critérios", () => {
  const dup = (xs: string[]) => new Set(xs).size === xs.length;
  assert.ok(dup(kits.map((k) => k.id)));
  for (const k of kits) {
    assert.ok(dup(k.problemas.map((p) => p.id)), `problemas de ${k.id}`);
    assert.ok(dup(k.criterios.map((c) => c.id)), `critérios de ${k.id}`);
    assert.equal(KITS[k.id], k);
  }
});

test("cada critério tem 4 níveis não vazios; rubricas têm 6 critérios", () => {
  for (const k of kits) {
    assert.equal(k.criterios.length, 6, k.id);
    for (const c of k.criterios)
      for (const n of [1, 2, 3, 4] as const) assert.ok(c.niveis[n].trim().length > 0, `${k.id}/${c.id}/${n}`);
  }
  assert.deepEqual(
    obterKit("system_design")!.criterios.map((c) => c.id),
    ["requisitos", "componentes_fluxo", "escalabilidade", "dados_consistencia", "tradeoffs", "comunicacao"],
  );
});

test("fichas, sinais, armadilhas e perguntas não são vazios", () => {
  for (const k of kits) {
    assert.ok(k.tiposPergunta.length > 0 && k.termosTranscricao.length > 0, k.id);
    for (const p of k.problemas) {
      assert.ok(p.ficha.length >= 7, `ficha ${p.id}`);
      for (const f of p.ficha) assert.ok(f.pergunta.trim() && f.resposta.trim(), p.id);
      assert.ok(p.sinaisEsperados.length > 0 && p.armadilhas.length > 0 && p.perguntasSugeridas.length > 0, p.id);
    }
  }
});

test("modos de leitura e problemas por kit", () => {
  assert.equal(obterKit("system_design")!.modoLeitura, "grafo");
  assert.equal(obterKit("design_produto")!.modoLeitura, "visual");
  assert.equal(obterKit("system_design")!.problemas.length, 3);
  assert.equal(obterKit("inexistente"), undefined);
  assert.equal(obterKit("__proto__"), undefined);
  assert.equal(obterProblema("system_design", "chat_tempo_real")?.titulo, "Chat em tempo real");
  assert.equal(obterProblema("system_design", "x"), undefined);
});

test("resolverAvaliacao", async () => {
  const casos: Record<string, [string, string]> = {
    demo: ["system_design", "encurtador_url"],
    "demo-chat": ["system_design", "chat_tempo_real"],
    "demo-pagamentos": ["system_design", "pagamentos_instantaneos"],
    "demo-produto": ["design_produto", "onboarding_60_mais"],
  };
  for (const [id, [kitId, problemaId]] of Object.entries(casos)) {
    const r = await resolverAvaliacao(id);
    assert.equal(r?.kit.id, kitId);
    assert.equal(r?.problema.id, problemaId);
  }
  assert.equal(await resolverAvaliacao("nao-existe"), undefined);
  assert.equal(await resolverAvaliacao("constructor"), undefined);
});

test("dados públicos têm só titulo e enunciado", () => {
  for (const k of kits)
    for (const p of k.problemas) {
      const pub = dadosPublicosDoProblema(p);
      assert.deepEqual(Object.keys(pub).filter((c) => c !== "fala_do_desafio").sort(), ["enunciado", "titulo"]);
      assert.equal(pub.enunciado, p.enunciado);
      const json = JSON.stringify(pub);
      assert.ok(!json.includes(p.ficha[0].resposta));
    }
});
