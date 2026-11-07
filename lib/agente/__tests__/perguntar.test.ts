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

describe("perguntar: defesas contra quebra de personagem", () => {
  const roda = async (texto: string, requisito: string | null = null) => {
    const logs: Array<[string, unknown]> = [];
    const llm = criarClienteFalso([{ responder: true, texto, requisito }]);
    const r = await perguntar(
      { llm, kit: kitDemo, problema, log: (e: string, m: unknown) => logs.push([e, m]) } as never,
      estado,
      { fase: "REQUISITOS", texto: "Qual o prazo de confirmação?" },
      AGORA,
    );
    return { r, logs };
  };

  it("'A ficha diz que...' é reescrito sem citar a ficha e registra o ajuste", async () => {
    const { r, logs } = await roda("A ficha diz que a confirmação precisa sair em menos de 2 segundos.", "Confirmação < 2 s");
    assert.equal(r.responder, true);
    assert.equal(r.texto, "A confirmação precisa sair em menos de 2 segundos.");
    assert.equal(r.requisito, "Confirmação < 2 s");
    assert.ok(!/ficha/i.test(r.estado.conversa.at(-1)!.texto));
    assert.ok(logs.some(([e, m]) => e === "perguntar_ajuste" && (m as { ajuste: string }).ajuste === "cita_ficha"));
  });

  it("'Segundo a ficha,' também é reescrito", async () => {
    const { r } = await roda("Segundo a ficha, são 5 anos de retenção.");
    assert.equal(r.texto, "São 5 anos de retenção.");
  });

  it("menção à ficha que não dá para limpar com segurança: fica quieto", async () => {
    const { r, logs } = await roda("Isso não está na ficha, pode assumir algo.");
    assert.equal(r.responder, false);
    assert.equal(r.texto, "");
    assert.ok(logs.some(([e, m]) => e === "perguntar_ajuste" && (m as { ajuste: string }).ajuste === "cita_ficha"));
  });

  it("contra-pergunta no final é removida, mantendo a resposta", async () => {
    const { r, logs } = await roda("O pico é de 40 mil por segundo. Como você garante isso no desenho?", "Pico: 40 mil/s");
    assert.equal(r.responder, true);
    assert.equal(r.texto, "O pico é de 40 mil por segundo.");
    assert.ok(!r.texto.includes("?"));
    assert.ok(logs.some(([e, m]) => e === "perguntar_ajuste" && (m as { ajuste: string }).ajuste === "contra_pergunta"));
  });

  it("só uma pergunta, sem resposta: fica quieto", async () => {
    const { r } = await roda("Como você garante isso?");
    assert.equal(r.responder, false);
  });

  it("resposta normal não é alterada nem gera log de ajuste", async () => {
    const { r, logs } = await roda("A gente espera uns 4 mil acessos por segundo. O time quer isso com 99,9% de disponibilidade.", "Leitura: ~4 mil/s");
    assert.equal(r.texto, "A gente espera uns 4 mil acessos por segundo. O time quer isso com 99,9% de disponibilidade.");
    assert.equal(logs.length, 0);
  });

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

  it("recusa que termina em convite sem '?' passa intacta pela limpeza", async () => {
    const t = "Isso prefiro ouvir de você. Me conta como você abordaria o problema.";
    const { r, logs } = await roda(t);
    assert.equal(r.responder, true);
    assert.equal(r.texto, t);
    assert.equal(logs.length, 0);
  });

  it("recusa seguida de pergunta ainda tem a pergunta cortada", async () => {
    const { r } = await roda("Não posso te dar a resposta pronta. Como você abordaria o problema?");
    assert.equal(r.texto, "Não posso te dar a resposta pronta.");
  });
});
