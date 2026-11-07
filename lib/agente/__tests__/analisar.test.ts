import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analisar, type DepsAnalisar } from "../analisar";
import { eQuaseDuplicada, eEnchimento, limitarFrases, temLinguagemAvaliativa } from "../guardas";
import { KIT_SYSTEM_DESIGN as kitDemo } from "../kits/system-design";
import { criarClienteFalso, ErroLlm } from "../llm/cliente";
import { estadoInicial, transicionar, type EstadoSessao } from "../sessao/estado";
import type { Fase, PedidoAnalise, RespostaAnalise } from "../sessao/tipos";

const AGORA = 10_000_000;
const problema = kitDemo.problemas[0];
const criterios = kitDemo.criterios.map((c) => c.id);

const logs: [string, Record<string, unknown>][] = [];
const log = (e: string, m: Record<string, unknown>) => void logs.push([e, m]);

function deps(llm: DepsAnalisar["llm"]): DepsAnalisar {
  return { llm, kit: kitDemo, problema, log };
}

function estadoEm(fase: Fase, extra: Partial<EstadoSessao> = {}): EstadoSessao {
  return { ...estadoInicial({ criterios }), fase, faseIniciadaEm: AGORA - 1000, ...extra };
}

function pedido(fase: Fase = "APROFUNDAMENTO"): PedidoAnalise {
  return {
    sessao_id: "s1",
    fase,
    grafo: "COMPONENTES\n- [r1] Cliente (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] Cliente → Postgres",
    mudancas: "+ adicionou [e1] Postgres",
    conversa_recente: [],
    perguntas_feitas: 0,
    imagem_url: null,
  };
}

function duvida(extra: Partial<RespostaAnalise> = {}): RespostaAnalise {
  return {
    status: "duvida",
    pergunta: "Com leitura cem vezes maior, o que protege esse banco?",
    nota: "Leitura 100x: gargalo?",
    elementos: ["e1"],
    degrau: null,
    observacoes: [{ criterio: "escalabilidade", sinal: "negativo", espontaneo: false, evidencia: "banco único" }],
    ...extra,
  };
}

describe("analisar", () => {
  it("dúvida válida vira PLIN_PENDENTE e registra observações", async () => {
    const r = await analisar(deps(criarClienteFalso([duvida()])), estadoEm("APROFUNDAMENTO"), pedido(), AGORA);
    assert.equal(r.resposta.status, "duvida");
    assert.deepEqual(r.resposta.elementos, ["e1"]);
    assert.equal(r.estado.plin, "PLIN_PENDENTE");
    assert.equal(r.efeitos[0].tipo, "PLIN_PENDENTE");
    assert.equal(r.estado.cobertura.escalabilidade.negativo, 1);
    assert.equal(r.diagnostico.origem, "llm");
  });

  it("o prompt enviado ao LLM leva o grafo no bloco dinâmico, não no estático", async () => {
    const llm = criarClienteFalso([duvida()]);
    await analisar(deps(llm), estadoEm("APROFUNDAMENTO"), pedido(), AGORA);
    const a = llm.chamadas[0];
    assert.ok(a.sistema.dinamico!.includes("[e1] Postgres"));
    assert.ok(!a.sistema.estatico.includes("[e1] Postgres"));
    assert.equal(a.nomeSchema, "analise_quadro");
  });

  it("nada da ficha/rubrica aparece na resposta ao quadro", async () => {
    const r = await analisar(deps(criarClienteFalso([duvida()])), estadoEm("APROFUNDAMENTO"), pedido(), AGORA);
    const json = JSON.stringify(r.resposta);
    for (const f of problema.ficha) assert.ok(!json.includes(f.resposta));
    for (const c of kitDemo.criterios) for (const n of [1, 2, 3, 4] as const) assert.ok(!json.includes(c.niveis[n]));
    assert.deepEqual(Object.keys(r.resposta).sort(), ["degrau", "elementos", "nota", "observacoes", "pergunta", "status"]);
  });

  it("ok cancela a dúvida pendente", async () => {
    const pend = transicionar(estadoEm("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, AGORA).estado;
    assert.equal(pend.plin, "PLIN_PENDENTE");
    const ok: RespostaAnalise = { status: "ok", pergunta: null, nota: null, elementos: [], degrau: null, observacoes: [] };
    const r = await analisar(deps(criarClienteFalso([ok])), pend, pedido(), AGORA + 1000);
    assert.equal(r.estado.plin, "LIVRE");
    assert.deepEqual(r.efeitos, [{ tipo: "PLIN_CANCELADO", motivo: "ok" }]);
  });

  it("status não permitido na fase é rebaixado para ok, mantendo observações", async () => {
    const r = await analisar(deps(criarClienteFalso([duvida()])), estadoEm("ALTO_NIVEL"), pedido("ALTO_NIVEL"), AGORA);
    assert.equal(r.resposta.status, "ok");
    assert.equal(r.resposta.pergunta, null);
    assert.equal(r.resposta.observacoes.length, 1);
    assert.equal(r.estado.plin, "LIVRE");
    assert.equal(r.estado.cobertura.escalabilidade.negativo, 1);
    assert.ok(r.diagnostico.ajustes.includes("rebaixada_pela_politica"));
  });

  it("REQUISITOS: a análise roda e colhe observações, sem plin", async () => {
    const obs: RespostaAnalise = duvida({ observacoes: [{ criterio: "requisitos", sinal: "positivo", espontaneo: true, evidencia: "perguntou a escala" }] });
    const r = await analisar(deps(criarClienteFalso([obs])), estadoEm("REQUISITOS"), pedido("REQUISITOS"), AGORA);
    assert.equal(r.diagnostico.origem, "llm");
    assert.equal(r.resposta.status, "ok");
    assert.equal(r.estado.cobertura.requisitos.positivo, 1);
  });

  it("intervalo/limite não bloqueiam a análise: observações entram, plin não", async () => {
    const e = estadoEm("APROFUNDAMENTO", { perguntasFeitas: 5, ultimaPerguntaEm: AGORA - 1000 });
    const r = await analisar(deps(criarClienteFalso([duvida()])), e, pedido(), AGORA);
    assert.equal(r.diagnostico.origem, "llm");
    assert.equal(r.resposta.status, "ok");
    assert.equal(r.estado.cobertura.escalabilidade.negativo, 1);
  });

  it("fase que não analisa ou candidato respondendo: não chama o LLM", async () => {
    for (const e of [estadoEm("APRESENTACAO"), estadoEm("APROFUNDAMENTO", { plin: "PERGUNTA_ATIVA" })]) {
      const llm = criarClienteFalso([duvida()]);
      const r = await analisar(deps(llm), e, pedido(), AGORA);
      assert.equal(llm.chamadas.length, 0);
      assert.equal(r.resposta.status, "ok");
      assert.equal(r.diagnostico.origem, "bloqueado");
    }
  });

  it("descarta ids de elementos que não existem no grafo", async () => {
    const r = await analisar(deps(criarClienteFalso([duvida({ elementos: ["e1", "zz9", "r1"] })])), estadoEm("APROFUNDAMENTO"), pedido(), AGORA);
    assert.deepEqual(r.resposta.elementos, ["e1", "r1"]);
  });

  it("pergunta quase igual a uma já feita é descartada (vira ok)", async () => {
    const feita = { numero: 1, status: "duvida" as const, pergunta: "Com leitura cem vezes maior, o que protege o banco?", nota: null, elementos: ["e1"], degrau: null, fase: "APROFUNDAMENTO" as const, feitaEm: AGORA - 120_000 };
    const e = estadoEm("APROFUNDAMENTO", { perguntas: [feita], perguntasFeitas: 1, ultimaPerguntaEm: AGORA - 120_000 });
    const r = await analisar(deps(criarClienteFalso([duvida()])), e, pedido(), AGORA);
    assert.equal(r.resposta.status, "ok");
    assert.ok(r.diagnostico.ajustes.includes("pergunta_repetida"));
    assert.equal(r.estado.plin, "LIVRE");
  });

  it("repetir a dúvida pendente mantém a pendente (não cancela)", async () => {
    const pend = transicionar(estadoEm("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, AGORA).estado;
    const r = await analisar(deps(criarClienteFalso([duvida({ pergunta: "Com leitura cem vezes maior, o que protege esse banco aí?" })])), pend, pedido(), AGORA + 1000);
    assert.equal(r.resposta.status, "duvida");
    assert.equal(r.estado.plin, "PLIN_PENDENTE");
  });

  it("linguagem avaliativa na pergunta: rebaixa para ok", async () => {
    for (const p of ["Ótimo, e se o cache cair?", "Isso está correto. E a réplica?", "Parabéns pelo desenho, e o gargalo?"]) {
      const r = await analisar(deps(criarClienteFalso([duvida({ pergunta: p })])), estadoEm("APROFUNDAMENTO"), pedido(), AGORA);
      assert.equal(r.resposta.status, "ok", p);
      assert.equal(r.resposta.pergunta, null);
      assert.ok(r.diagnostico.ajustes.includes("linguagem_avaliativa"));
    }
  });

  it("erro do LLM (timeout, inválido, qualquer) devolve ok sem lançar e sem mudar o estado", async () => {
    logs.length = 0;
    const e = estadoEm("APROFUNDAMENTO");
    for (const erro of [new ErroLlm("timeout", "x"), new ErroLlm("invalido", "y"), new Error("boom com dados do candidato")]) {
      const r = await analisar(deps(criarClienteFalso([erro])), e, pedido(), AGORA);
      assert.equal(r.resposta.status, "ok");
      assert.equal(r.estado, e);
      assert.equal(r.diagnostico.origem, "erro");
    }
    const texto = JSON.stringify(logs);
    assert.ok(!texto.includes("Postgres"), "log não pode ter o grafo");
    assert.ok(!texto.includes("boom"), "log não pode ter a mensagem do erro");
  });
});

describe("guardas", () => {
  it("linguagem avaliativa", () => {
    assert.equal(temLinguagemAvaliativa("Excelente escolha"), true);
    assert.equal(temLinguagemAvaliativa("Está errado?"), true);
    assert.equal(temLinguagemAvaliativa("Por que Postgres aqui?"), false);
    assert.equal(temLinguagemAvaliativa("O incorreto? "), false);
  });
  it("duplicadas por sobreposição de tokens", () => {
    const a = "Onde está o gargalo com leitura cem vezes maior que a escrita?";
    assert.equal(eQuaseDuplicada("Qual o gargalo com a leitura cem vezes maior que escrita?", [a]), true);
    assert.equal(eQuaseDuplicada("O que acontece se o cache cair?", [a]), false);
    assert.equal(eQuaseDuplicada("E o cache?", ["E o cache?"]), true);
  });
  it("enchimento e limite de frases", () => {
    for (const f of ["ok", "Hmm...", "Deixa eu ver", "Entendi!"]) assert.equal(eEnchimento(f), true, f);
    assert.equal(eEnchimento("Quantos acessos por segundo?"), false);
    assert.equal(limitarFrases("Um. Dois! Três?", 2), "Um. Dois!");
  });
});
