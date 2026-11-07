import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitDemo } from "../kits/demo";
import { criarClienteFalso, ErroLlm } from "../llm/cliente";
import { perguntar } from "../perguntar";
import { estadoInicial } from "../sessao/estado";

const AGORA = 1_000_000;
const problema = kitDemo.problemas[0];
const estado = { ...estadoInicial(), fase: "REQUISITOS" as const, faseIniciadaEm: AGORA };
const deps = (llm: ReturnType<typeof criarClienteFalso>) => ({ llm, kit: kitDemo, problema, log: () => {} });

describe("perguntar", () => {
  it("enchimento: responder false, sem chamar o LLM, mas registra a fala", async () => {
    for (const t of ["ok", "hmm", "deixa eu ver", "entendi"]) {
      const llm = criarClienteFalso([{ responder: true, texto: "x", requisito: null }]);
      const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: t }, AGORA);
      assert.equal(r.responder, false);
      assert.equal(r.texto, "");
      assert.equal(llm.chamadas.length, 0);
      assert.equal(r.estado.conversa.at(-1)?.texto, t);
    }
  });

  it("LLM pode devolver responder false", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "então, vou pensar nisso" }, AGORA);
    assert.equal(r.responder, false);
  });

  it("responde pela ficha, devolve requisito e registra as duas falas", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Uns 4 mil acessos por segundo, com picos de 40 mil.", requisito: "Leitura: ~4 mil/s (picos de 40 mil)" }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Quantos acessos por segundo?" }, AGORA);
    assert.equal(r.responder, true);
    assert.equal(r.requisito, "Leitura: ~4 mil/s (picos de 40 mil)");
    assert.deepEqual(r.estado.conversa.map((f) => f.quem), ["candidato", "agente"]);
    // A ficha está no prompt estático (servidor), a fala do candidato vai como mensagem.
    const a = llm.chamadas[0];
    assert.ok(a.sistema.estatico.includes("4 mil por segundo"));
    assert.equal(a.mensagens[0].content, "Quantos acessos por segundo?");
    assert.equal(a.nomeSchema, "resposta_entrevistador");
  });

  it("limita a 2 frases e não repete requisito já no quadro", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Um. Dois. Três.", requisito: "Retenção: 5 anos" }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?", requisitosAtuais: ["Retenção: 5 anos"] }, AGORA);
    assert.equal(r.texto, "Um. Dois.");
    assert.equal(r.requisito, null);
  });

  it("linguagem avaliativa na resposta: fica quieto", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Ótima pergunta! 5 anos.", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?" }, AGORA);
    assert.equal(r.responder, false);
  });

  it("erro do LLM: responder false, sem lançar", async () => {
    const llm = criarClienteFalso([new ErroLlm("timeout", "x")]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Quantos acessos?" }, AGORA);
    assert.equal(r.responder, false);
    assert.equal(r.estado.conversa.length, 1);
  });
});
