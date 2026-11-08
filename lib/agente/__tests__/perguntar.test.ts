import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KIT_SYSTEM_DESIGN as kitDemo } from "../kits/system-design";
import { criarClienteFalso, ErroLlm } from "../llm/cliente";
import { perguntar } from "../perguntar";
import { estadoInicial } from "../sessao/estado";

const AGORA = 1_000_000;
const problema = kitDemo.problemas[0];
const estado = { ...estadoInicial(), fase: "REQUISITOS" as const, faseIniciadaEm: AGORA };
const deps = (llm: ReturnType<typeof criarClienteFalso>) => ({ llm, kit: kitDemo, problema, log: () => {} });

describe("perguntar", () => {
  it("falas curtas vão ao modelo (sem lista de palavras) e a fala é registrada", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "hmm, deixa eu ver" }, AGORA);
    assert.equal(llm.chamadas.length, 1);
    assert.equal(r.responder, false);
    assert.equal(r.estado.conversa.at(-1)?.texto, "hmm, deixa eu ver");
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

  it("erro do LLM: responder false, sem lançar", async () => {
    const llm = criarClienteFalso([new ErroLlm("timeout", "x")]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Quantos acessos?" }, AGORA);
    assert.equal(r.responder, false);
    assert.equal(r.estado.conversa.length, 1);
  });
});

describe("conclusão (interpretada pelo modelo)", () => {
  it("repassa concluiu quando o modelo interpreta que o candidato terminou", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Certo, vou olhar o que você montou.", requisito: null, concluiu: true }]);
    const r = await perguntar(deps(llm), { ...estado, fase: "ALTO_NIVEL" }, { fase: "ALTO_NIVEL", texto: "acho que já deu, podemos seguir?" }, AGORA);
    assert.equal(r.concluiu, true);
    assert.equal(r.responder, true);
  });

  it("concluiu vale mesmo sem texto de resposta (o sinal é do modelo, o código não inventa fala)", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: true }]);
    const r = await perguntar(deps(llm), { ...estado, fase: "ALTO_NIVEL" }, { fase: "ALTO_NIVEL", texto: "é isso" }, AGORA);
    assert.equal(r.concluiu, true);
    assert.equal(r.responder, false);
    assert.equal(r.texto, "");
  });

  it("o código não decide por palavras: 'pronto' sem interpretação do modelo não conclui", async () => {
    const llm = criarClienteFalso([{ responder: false, texto: "", requisito: null, concluiu: false }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "pronto, pode perguntar mais" }, AGORA);
    assert.equal(r.concluiu, false);
  });

  it("pergunta comum não marca concluiu", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Uns 4 mil por segundo.", requisito: null }]);
    const r = await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "qual a escala?" }, AGORA);
    assert.equal(r.concluiu, false);
});

describe("perguntar: prompt contra quebra de personagem (sem limpeza por código)", () => {
  it("o prompt estático não instrui a citar a ficha e proíbe pergunta", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Ok, 5 anos.", requisito: null }]);
    await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?" }, AGORA);
    const p = llm.chamadas[0].sistema.estatico;
    // "ficha" só pode aparecer dentro da proibição entre aspas.
    const semProibicao = p.replace(/"ficha"/g, "");
    assert.ok(!/ficha/i.test(semProibicao), "o prompt ainda usa o termo 'ficha' fora da proibição");
    assert.match(p, /NUNCA cite "ficha"/);
    assert.match(p, /NUNCA faça pergunta/);
    assert.match(p, /SEMPRE preencha/);
  });

  it("o prompt orienta recusa curta e variada, convite sem '?', assumir só se faltar dado e resposta só do perguntado", async () => {
    const llm = criarClienteFalso([{ responder: true, texto: "Ok, 5 anos.", requisito: null }]);
    await perguntar(deps(llm), estado, { fase: "REQUISITOS", texto: "Por quanto tempo guardo?" }, AGORA);
    const p = llm.chamadas[0].sistema.estatico;
    assert.match(p, /UMA frase curta e natural/);
    assert.match(p, /VARIE a redação/);
    assert.match(p, /convite sem interrogação/);
    assert.match(p, /SOMENTE quando a pergunta do candidato é sobre um dado que não existe/);
    assert.match(p, /Nunca use essa orientação em recusas/);
    assert.match(p, /Responda SOMENTE o que foi perguntado/);
    assert.ok(!/o time espera/i.test(p), "o prompt não deve sugerir 'o time espera'");
    // Sem texto fixo de recusa para copiar.
    assert.ok(!/Não posso compartilhar/i.test(p));
  });
  });
});
