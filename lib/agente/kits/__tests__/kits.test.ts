import { test } from "node:test";
import assert from "node:assert/strict";
import { Kit } from "../tipos";
import { KITS, obterKit, obterProblema, resolverAvaliacao, dadosPublicosDoProblema } from "../index";
import { EMPECILHOS_GENERICOS, escolherEmpecilhoGenerico, temMudancaPrevista } from "../empecilhos-genericos";
import { errosDoEmpecilho } from "../validar";

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

test("cada critério tem 4 níveis não vazios; rubricas têm 6 ou 7 critérios", () => {
  for (const k of kits) {
    assert.ok(k.criterios.length >= 6 && k.criterios.length <= 7, k.id);
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
  assert.equal(obterKit("system_design_ia")!.modoLeitura, "grafo");
  assert.deepEqual(obterKit("system_design_ia")!.criterios.map((c) => c.id).at(-1), "uso_ia");
  assert.equal(obterProblema("system_design_ia", "chatbot_atendimento_ia")?.titulo, "Chatbot de atendimento com IA");
  assert.equal(obterKit("inexistente"), undefined);
  assert.equal(obterKit("__proto__"), undefined);
  assert.equal(obterProblema("system_design", "chat_tempo_real")?.titulo, "Chat de mensagens em tempo real");
  assert.equal(obterProblema("system_design", "x"), undefined);
});

test("resolverAvaliacao", async () => {
  const casos: Record<string, [string, string]> = {
    demo: ["system_design", "encurtador_url"],
    "demo-chat": ["system_design", "chat_tempo_real"],
    "demo-pagamentos": ["system_design", "pagamentos_instantaneos"],
    "demo-chatbot-ia": ["system_design_ia", "chatbot_atendimento_ia"],
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

test("as três mudanças genéricas passam nas mesmas regras das mudanças geradas", () => {
  for (const [nome, e] of Object.entries(EMPECILHOS_GENERICOS)) {
    assert.deepEqual(errosDoEmpecilho(e), [], nome);
  }
  assert.deepEqual(
    Object.values(EMPECILHOS_GENERICOS).map((e) => e.tipo).sort(),
    ["parte_cai", "requisito_muda", "restricao_nova"],
  );
});

test("a genérica segue a cobertura: escalabilidade, depois dados e consistência, depois trade-offs", () => {
  assert.equal(escolherEmpecilhoGenerico(["escalabilidade", "dados_consistencia", "tradeoffs"]).id, EMPECILHOS_GENERICOS.volume.id);
  assert.equal(escolherEmpecilhoGenerico(["dados_consistencia", "tradeoffs"]).id, EMPECILHOS_GENERICOS.dependencia.id);
  assert.equal(escolherEmpecilhoGenerico(["tradeoffs", "comunicacao"]).id, EMPECILHOS_GENERICOS.orcamento.id);
  // Escalabilidade já coberta: sem evidência de consistência, cai na dependência, mesmo sem trade-offs.
  assert.equal(escolherEmpecilhoGenerico(["dados_consistencia"]).id, EMPECILHOS_GENERICOS.dependencia.id);
  // Sem pista (tudo coberto, ou só critérios do plano): volume 10x.
  assert.equal(escolherEmpecilhoGenerico([]).id, EMPECILHOS_GENERICOS.volume.id);
  assert.equal(escolherEmpecilhoGenerico(["comunicacao", "requisitos"]).id, EMPECILHOS_GENERICOS.volume.id);
});

test("problema sem mudança própria só tem mudança em kit de system design", () => {
  const semMudanca = { ...obterProblema("system_design", "encurtador_url")!, empecilho: undefined };
  assert.equal(temMudancaPrevista(obterKit("system_design")!, semMudanca), true, "a genérica do kit");
  assert.equal(temMudancaPrevista(obterKit("design_produto")!, semMudanca), false);
  assert.equal(temMudancaPrevista(obterKit("system_design")!, { empecilho: semMudanca.empecilho }), true);
});
