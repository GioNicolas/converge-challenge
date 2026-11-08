import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analisar, refiltrarComEstadoAtual, type DepsAnalisar } from "../analisar";
import { eQuaseDuplicada, limitarFrases } from "../guardas";
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
    assert.deepEqual(Object.keys(r.resposta).sort(), ["avancar_fase", "degrau", "elementos", "nota", "observacoes", "pergunta", "status"]);
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
    // Em REQUISITOS só `duvida` vale (convite do silêncio inicial); `dica` é barrada.
    const r = await analisar(deps(criarClienteFalso([duvida({ status: "dica" })])), estadoEm("REQUISITOS"), pedido("REQUISITOS"), AGORA);
    assert.equal(r.resposta.status, "ok");
    assert.equal(r.resposta.pergunta, null);
    assert.equal(r.resposta.observacoes.length, 1);
    assert.equal(r.estado.plin, "LIVRE");
    assert.equal(r.estado.cobertura.escalabilidade.negativo, 1);
    assert.ok(r.diagnostico.ajustes.includes("rebaixada_pela_politica"));
  });

  it("REQUISITOS: o convite (duvida) vira plin e não gasta a cota de perguntas", async () => {
    const r = await analisar(deps(criarClienteFalso([duvida({ elementos: [] })])), estadoEm("REQUISITOS"), pedido("REQUISITOS"), AGORA);
    assert.equal(r.resposta.status, "duvida");
    assert.equal(r.estado.plin, "PLIN_PENDENTE");
    const clicado = transicionar(r.estado, { tipo: "PLIN_CLICADO" }, AGORA + 1).estado;
    assert.equal(clicado.plin, "PERGUNTA_ATIVA");
    assert.equal(clicado.perguntasFeitas, 0);
  });

  it("REQUISITOS: a análise roda e colhe observações; só `duvida` (convite) vira plin", async () => {
    const obs: RespostaAnalise = duvida({ status: "redirecionar", observacoes: [{ criterio: "requisitos", sinal: "positivo", espontaneo: true, evidencia: "perguntou a escala" }] });
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
  it("duplicadas por sobreposição de tokens", () => {
    const a = "Onde está o gargalo com leitura cem vezes maior que a escrita?";
    assert.equal(eQuaseDuplicada("Qual o gargalo com a leitura cem vezes maior que escrita?", [a]), true);
    assert.equal(eQuaseDuplicada("O que acontece se o cache cair?", [a]), false);
    assert.equal(eQuaseDuplicada("E o cache?", ["E o cache?"]), true);
  });
  it("limite de frases", () => {
    assert.equal(limitarFrases("Um. Dois! Três?", 2), "Um. Dois!");
  });
});

describe("foto do quadro", () => {
  const FOTO = "data:image/jpeg;base64,/9j/4AAQ";
  it("vai ao modelo junto do pedido, com a instrução de como usá-la", async () => {
    const llm = criarClienteFalso([{ status: "ok", observacoes: [] }]);
    await analisar(deps(llm), estadoEm("APROFUNDAMENTO"), { ...pedido(), imagem_base64: FOTO }, AGORA);
    assert.equal(llm.chamadas[0].imagem, FOTO);
    assert.match(llm.chamadas[0].sistema.dinamico ?? "", /FOTO DO QUADRO/);
  });
  it("sem foto, nada muda", async () => {
    const llm = criarClienteFalso([{ status: "ok", observacoes: [] }]);
    await analisar(deps(llm), estadoEm("APROFUNDAMENTO"), pedido(), AGORA);
    assert.equal(llm.chamadas[0].imagem ?? null, null);
    assert.doesNotMatch(llm.chamadas[0].sistema.dinamico ?? "", /FOTO DO QUADRO/);
  });
});

describe("refiltrarComEstadoAtual", () => {
  const falou = (base: EstadoSessao, em: number) => transicionar(base, { tipo: "AGENTE_FALOU", texto: "São 20 mil por dia." }, em).estado;
  const ped = (parado?: number): PedidoAnalise => ({ ...pedido(), ...(parado !== undefined ? { parado_ha_s: parado } : {}) });

  it("fala do agente gravada durante a análise: a bola está com o candidato e a pergunta é silenciada", () => {
    const fresco = falou(estadoEm("APROFUNDAMENTO"), AGORA + 1000);
    const r = refiltrarComEstadoAtual(fresco, duvida(), ped(30), AGORA, AGORA + 2000);
    assert.equal(r.status, "ok");
    assert.equal(r.pergunta, null);
    assert.deepEqual(r.elementos, []);
    assert.equal(r.observacoes.length, 1, "as observações são preservadas");
  });

  it("o tempo decorrido soma-se ao parado_ha_s (conservador: não assume ação durante a análise)", () => {
    const fresco = falou(estadoEm("APROFUNDAMENTO"), AGORA + 1000);
    // 1 s parado + 2 s de análise = 3 s: a fala foi há 1 s do fim, ele continua sem agir depois dela.
    assert.equal(refiltrarComEstadoAtual(fresco, duvida(), ped(1), AGORA, AGORA + 2000).status, "ok");
  });

  it("candidato que agiu depois da fala (parado há pouco) mantém a pergunta", () => {
    const fresco = falou(estadoEm("APROFUNDAMENTO"), AGORA - 5000);
    const r = refiltrarComEstadoAtual(fresco, duvida(), ped(1), AGORA, AGORA + 500);
    assert.equal(r.status, "duvida");
    assert.deepEqual(r.elementos, ["e1"]);
  });

  it("silêncio longo depois da fala mantém a pergunta", () => {
    const fresco = falou(estadoEm("APROFUNDAMENTO"), AGORA - 60_000);
    assert.equal(refiltrarComEstadoAtual(fresco, duvida(), ped(40), AGORA, AGORA + 500).status, "duvida");
  });

  it("sem parado_ha_s a regra não se aplica", () => {
    const fresco = falou(estadoEm("APROFUNDAMENTO"), AGORA + 1000);
    assert.equal(refiltrarComEstadoAtual(fresco, duvida(), ped(), AGORA, AGORA + 2000).status, "duvida");
  });

  it("é idempotente para resposta já silenciada e para resposta já filtrada", () => {
    const livre = estadoEm("APROFUNDAMENTO");
    const silenciada = refiltrarComEstadoAtual(falou(livre, AGORA + 1000), duvida(), ped(30), AGORA, AGORA + 2000);
    assert.deepEqual(refiltrarComEstadoAtual(livre, silenciada, ped(30), AGORA, AGORA + 2000), silenciada);
    const filtrada = refiltrarComEstadoAtual(livre, duvida(), ped(), AGORA, AGORA + 2000);
    assert.deepEqual(refiltrarComEstadoAtual(livre, filtrada, ped(), AGORA, AGORA + 2000), filtrada);
  });
});
