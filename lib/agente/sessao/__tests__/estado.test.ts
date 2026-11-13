import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  criteriosDoPlanoSemEvidencia,
  criteriosSemEvidencia,
  estadoInicial,
  MAX_PERGUNTAS_DESCARTADAS,
  nomesDosCriteriosDoPlano,
  transicionar,
  type EstadoSessao,
  type EventoSessao,
} from "../estado";
import type { PlanoDaSessao } from "../../plano";
import { intervaloMinimoMs, orcamentoDeInterrupcoes } from "../../../interrupcao/politica";
import type { Fase, RespostaAnalise } from "../tipos";

const T0 = 1_000_000;
const MIN = 60_000;
const LIMITE = orcamentoDeInterrupcoes(35);
const INTERVALO = intervaloMinimoMs(35);

function duvida(extra: Partial<RespostaAnalise> = {}): RespostaAnalise {
  return {
    status: "duvida", parteFechada: true, escopo: false,
    pergunta: "Onde fica o gargalo?",
    nota: "Gargalo?",
    elementos: ["e1"],
    degrau: null,
    observacoes: [],
    ...extra,
  };
}

function respostaOk(): RespostaAnalise {
  return duvida({ status: "ok", pergunta: null, nota: null, elementos: [], parteFechada: false });
}

/** Aplica uma lista de eventos, cada um 1s depois do anterior (a menos que `em` seja dado). */
function aplicar(estado: EstadoSessao, ...eventos: EventoSessao[]) {
  let atual = estado;
  let agora = T0;
  for (const e of eventos) {
    atual = transicionar(atual, e, agora).estado;
    agora += 1000;
  }
  return atual;
}

function emFase(fase: Fase): EstadoSessao {
  const caminho: Record<string, EventoSessao[]> = {
    AGUARDANDO: [],
    APRESENTACAO: [{ tipo: "COMECAR" }],
    REQUISITOS: [{ tipo: "COMECAR" }, { tipo: "APRESENTACAO_TERMINOU" }],
    ALTO_NIVEL: [{ tipo: "COMECAR" }, { tipo: "APRESENTACAO_TERMINOU" }, { tipo: "CANDIDATO_DESENHOU" }],
    APROFUNDAMENTO: [
      { tipo: "COMECAR" },
      { tipo: "APRESENTACAO_TERMINOU" },
      { tipo: "CANDIDATO_DESENHOU" },
      { tipo: "APROFUNDAR" },
    ],
  };
  if (fase === "FECHAMENTO") return transicionar(emFase("APROFUNDAMENTO"), { tipo: "TICK" }, T0 + 10_000 * MIN).estado;
  if (fase === "ENCERRADA") return aplicar(emFase("APROFUNDAMENTO"), { tipo: "ENCERRAR" });
  return aplicar(estadoInicial(), ...caminho[fase]);
}

describe("fases: eventos explícitos", () => {
  it("segue a ordem AGUARDANDO até APROFUNDAMENTO", () => {
    let e = estadoInicial();
    assert.equal(e.fase, "AGUARDANDO");
    e = aplicar(e, { tipo: "COMECAR" });
    assert.equal(e.fase, "APRESENTACAO");
    e = aplicar(e, { tipo: "APRESENTACAO_TERMINOU" });
    assert.equal(e.fase, "REQUISITOS");
    e = aplicar(e, { tipo: "CANDIDATO_DESENHOU" });
    assert.equal(e.fase, "ALTO_NIVEL");
    e = aplicar(e, { tipo: "APROFUNDAR" });
    assert.equal(e.fase, "APROFUNDAMENTO");
  });

  it("eventos fora de hora são ignorados", () => {
    assert.equal(aplicar(estadoInicial(), { tipo: "CANDIDATO_DESENHOU" }).fase, "AGUARDANDO");
    assert.equal(aplicar(estadoInicial(), { tipo: "APROFUNDAR" }).fase, "AGUARDANDO");
    assert.equal(aplicar(emFase("REQUISITOS"), { tipo: "APROFUNDAR" }).fase, "REQUISITOS");
    assert.equal(aplicar(emFase("ALTO_NIVEL"), { tipo: "COMECAR" }).fase, "ALTO_NIVEL");
  });

  it("ENCERRAR vai para ENCERRADA, limpa o plin e emite os efeitos", () => {
    const pendente = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    assert.equal(pendente.plin, "PLIN_PENDENTE");
    const { estado, efeitos } = transicionar(pendente, { tipo: "ENCERRAR" }, T0 + 5000);
    assert.equal(estado.fase, "ENCERRADA");
    assert.equal(estado.plin, "LIVRE");
    assert.equal(estado.perguntaPendente, null);
    assert.deepEqual(efeitos.map((f) => f.tipo), ["FASE_MUDOU", "PLIN_CANCELADO", "SESSAO_ENCERRADA"]);
  });

  it("ENCERRADA ignora tudo", () => {
    const fim = emFase("ENCERRADA");
    const r = transicionar(fim, { tipo: "COMECAR" }, T0);
    assert.equal(r.estado, fim);
    assert.deepEqual(r.efeitos, []);
  });
});

describe("fases: orçamento de tempo", () => {
  const tempos = { REQUISITOS: 10, ALTO_NIVEL: 20, APROFUNDAMENTO: 30, FECHAMENTO: 5 };

  it("TICK avança fase a fase quando o tempo estoura, até ENCERRADA", () => {
    let e = aplicar(estadoInicial({ tempos }), { tipo: "COMECAR" }, { tipo: "APRESENTACAO_TERMINOU" });
    let t = e.faseIniciadaEm!;
    const esperado: Fase[] = ["ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO", "ENCERRADA"];
    // O APROFUNDAMENTO acaba com 85% do tempo total (65 s = 55,25 s desde o COMECAR). Ele começa aos 31 s (a apresentação
    // e cada evento do `aplicar` andam 1 s), então dura 24,25 s (#129, decisão F).
    const duracoes = [10, 20, 24.25, 5];
    esperado.forEach((fase, i) => {
      // Um instante antes: nada acontece.
      assert.equal(transicionar(e, { tipo: "TICK" }, t + duracoes[i] * 1000 - 1).estado.fase, e.fase);
      t += duracoes[i] * 1000;
      const r = transicionar(e, { tipo: "TICK" }, t);
      assert.equal(r.estado.fase, fase);
      assert.equal(r.estado.faseIniciadaEm, t);
      e = r.estado;
    });
  });

  it("APROFUNDAMENTO começa cedo: acaba com 85% do tempo total, não com o tempo de `tempos` (#129, decisão F)", () => {
    // Entrevista padrão, 35 min (2100 s). Começo aos 10 min: o APROFUNDAMENTO vai até 1785 s, ou seja 1185 s.
    let e = transicionar(estadoInicial(), { tipo: "COMECAR" }, T0).estado;
    e = transicionar(e, { tipo: "APRESENTACAO_TERMINOU" }, T0 + 1000).estado;
    e = transicionar(e, { tipo: "CANDIDATO_DESENHOU" }, T0 + 2000).estado;
    e = transicionar(e, { tipo: "APROFUNDAR" }, T0 + 10 * MIN).estado;
    assert.equal(transicionar(e, { tipo: "TICK" }, T0 + 10 * MIN + 1185_000 - 1).estado.fase, "APROFUNDAMENTO");
    assert.equal(transicionar(e, { tipo: "TICK" }, T0 + 10 * MIN + 1185_000).estado.fase, "FECHAMENTO");
  });

  it("APROFUNDAMENTO começa tarde: vale o mínimo de 60 s (#129, decisão F)", () => {
    let e = transicionar(estadoInicial(), { tipo: "COMECAR" }, T0).estado;
    e = transicionar(e, { tipo: "APRESENTACAO_TERMINOU" }, T0 + 1000).estado;
    e = transicionar(e, { tipo: "CANDIDATO_DESENHOU" }, T0 + 2000).estado;
    e = transicionar(e, { tipo: "APROFUNDAR" }, T0 + 30 * MIN).estado;
    assert.equal(transicionar(e, { tipo: "TICK" }, T0 + 30 * MIN + 60_000 - 1).estado.fase, "APROFUNDAMENTO");
    assert.equal(transicionar(e, { tipo: "TICK" }, T0 + 30 * MIN + 60_000).estado.fase, "FECHAMENTO");
  });

  it("fase sem tempo configurado não acaba sozinha", () => {
    const e = emFase("APRESENTACAO");
    assert.equal(transicionar(e, { tipo: "TICK" }, T0 + 99 * MIN).estado.fase, "APRESENTACAO");
    assert.equal(transicionar(estadoInicial(), { tipo: "TICK" }, T0 + 99 * MIN).estado.fase, "AGUARDANDO");
  });

  it("fechar por tempo descarta a pendente que o FECHAMENTO não aceita", () => {
    const pendente = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida({ status: "dica" }) });
    const r = transicionar(pendente, { tipo: "TICK" }, T0 + 10_000 * MIN);
    assert.equal(r.estado.fase, "FECHAMENTO");
    assert.equal(r.estado.perguntaPendente, null);
    assert.ok(r.efeitos.some((f) => f.tipo === "PLIN_CANCELADO"));
  });
});

describe("ciclo do plin", () => {
  const comPerguntaAtiva = () => {
    const r = transicionar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + MIN);
    return transicionar(r.estado, { tipo: "PLIN_CLICADO" }, T0 + MIN + 2000).estado;
  };
  it("a marca de fim depois do /perguntar não grava a resposta de novo (nem depois da réplica do agente)", () => {
    let e = transicionar(comPerguntaAtiva(), { tipo: "CANDIDATO_FALOU", texto: "Uso cache.", fimDeResposta: false }, T0 + MIN + 10_000).estado;
    e = transicionar(e, { tipo: "AGENTE_FALOU", texto: "Certo, e a expiração?" }, T0 + MIN + 11_000).estado;
    const r = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: " Uso cache. ", fimDeResposta: true }, T0 + MIN + 12_000);
    assert.deepEqual(r.estado.conversa.slice(-2).map((f) => f.texto), ["Uso cache.", "Certo, e a expiração?"]);
    assert.equal(r.estado.plin, "LIVRE");
    assert.deepEqual(r.efeitos.map((f) => f.tipo), ["RESPOSTA_ENCERRADA", "ANALISAR"]);
  });
  it("a marca de fim sem texto (botão \"terminei\") encerra a resposta sem gravar fala vazia", () => {
    const e = comPerguntaAtiva();
    const r = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "", fimDeResposta: true }, T0 + MIN + 12_000);
    assert.equal(r.estado.conversa.length, e.conversa.length);
    assert.equal(r.estado.plin, "LIVRE");
  });
  it("LIVRE → PLIN_PENDENTE → PERGUNTA_ATIVA → LIVRE", () => {
    const e = emFase("APROFUNDAMENTO");
    let r = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + MIN);
    assert.equal(r.estado.plin, "PLIN_PENDENTE");
    assert.deepEqual(r.efeitos.map((f) => f.tipo), ["PLIN_PENDENTE"]);

    r = transicionar(r.estado, { tipo: "PLIN_CLICADO" }, T0 + MIN + 2000);
    assert.equal(r.estado.plin, "PERGUNTA_ATIVA");
    assert.equal(r.estado.perguntasFeitas, 1);
    assert.equal(r.estado.perguntaAtiva?.numero, 1);
    assert.equal(r.estado.ultimaPerguntaEm, T0 + MIN + 2000);
    assert.deepEqual(r.estado.perguntas[0].elementos, ["e1"]);
    assert.deepEqual(r.efeitos.map((f) => f.tipo), ["PERGUNTA_INICIADA"]);

    r = transicionar(r.estado, { tipo: "CANDIDATO_FALOU", texto: "Uso cache.", fimDeResposta: true }, T0 + MIN + 30_000);
    assert.equal(r.estado.plin, "LIVRE");
    assert.equal(r.estado.perguntaAtiva, null);
    assert.equal(r.estado.ultimaRespostaEm, T0 + MIN + 30_000);
    assert.deepEqual(r.efeitos.map((f) => f.tipo), ["RESPOSTA_ENCERRADA", "ANALISAR"]);
  });

  it("fala do candidato sem marca de fim não encerra a resposta, mas entra no log", () => {
    let e = emFase("APROFUNDAMENTO");
    e = aplicar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    e = transicionar(e, { tipo: "PLIN_CLICADO" }, T0 + MIN).estado;
    e = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "Hmm, deixa eu pensar", fimDeResposta: false }, T0 + MIN + 1).estado;
    assert.equal(e.plin, "PERGUNTA_ATIVA");
    assert.deepEqual(e.conversa.map((c) => c.quem), ["agente", "candidato"]);
  });

  it("dúvida nova substitui a pendente (uma por vez)", () => {
    const e = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida({ pergunta: "Primeira?" }) });
    const r = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida({ pergunta: "Segunda?" }) }, T0 + 5000);
    assert.equal(r.estado.perguntaPendente?.pergunta, "Segunda?");
    const efeito = r.efeitos[0];
    assert.ok(efeito.tipo === "PLIN_PENDENTE" && efeito.substituiuAnterior);
  });

  it("ok cancela a pendente", () => {
    const e = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    const ok: RespostaAnalise = { status: "ok", parteFechada: false, escopo: false, pergunta: null, nota: null, elementos: [], degrau: null, observacoes: [] };
    const r = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: ok }, T0 + 5000);
    assert.equal(r.estado.plin, "LIVRE");
    assert.equal(r.estado.perguntaPendente, null);
    assert.deepEqual(r.efeitos, [{ tipo: "PLIN_CANCELADO", motivo: "ok" }]);
  });

  it("pendente expira (e pede nova análise) se os elementos citados mudaram", () => {
    const e = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida({ elementos: ["e1", "s2"] }) });
    const r = transicionar(e, { tipo: "ELEMENTOS_ALTERADOS", ids: ["r9", "s2"] }, T0 + 5000);
    assert.equal(r.estado.plin, "LIVRE");
    assert.equal(r.estado.perguntaPendente, null);
    assert.deepEqual(r.efeitos.map((f) => f.tipo), ["PLIN_CANCELADO", "ANALISAR"]);
  });

  it("pendente continua se mudaram só outros elementos", () => {
    const e = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    const r = transicionar(e, { tipo: "ELEMENTOS_ALTERADOS", ids: ["r9"] }, T0 + 5000);
    assert.equal(r.estado.plin, "PLIN_PENDENTE");
    assert.deepEqual(r.efeitos, []);
  });

  it("clique sem pendente é ignorado", () => {
    const e = emFase("APROFUNDAMENTO");
    const r = transicionar(e, { tipo: "PLIN_CLICADO" }, T0);
    assert.equal(r.estado, e);
  });

  it("análise durante a pergunta ativa não vira plin", () => {
    let e = aplicar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    e = transicionar(e, { tipo: "PLIN_CLICADO" }, T0 + MIN).estado;
    const r = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + 5 * MIN);
    assert.equal(r.estado.plin, "PERGUNTA_ATIVA");
    assert.equal(r.estado.perguntaPendente, null);
  });

  it("status que a fase não aceita não vira pendente", () => {
    const e = aplicar(emFase("REQUISITOS"), { tipo: "ANALISE_RECEBIDA", resposta: duvida({ status: "dica" }) });
    assert.equal(e.plin, "LIVRE");
    const ok = aplicar(emFase("ALTO_NIVEL"), { tipo: "ANALISE_RECEBIDA", resposta: duvida({ status: "duvida" }) });
    assert.equal(ok.plin, "PLIN_PENDENTE");
  });

  it("acabar o orçamento de perguntas não encerra o aprofundamento antes da hora", () => {
    // Já no fim da entrevista (a cota proporcional deixa a última pergunta).
    let e: EstadoSessao = { ...emFase("APROFUNDAMENTO"), iniciadaEm: T0 - 34 * MIN, perguntasFeitas: LIMITE - 1, ultimaPerguntaEm: null };
    e = aplicar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    e = transicionar(e, { tipo: "PLIN_CLICADO" }, T0 + MIN).estado;
    const r = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "Pronto.", fimDeResposta: true }, T0 + 2 * MIN);
    assert.equal(r.estado.perguntasFeitas, LIMITE);
    assert.equal(r.estado.fase, "APROFUNDAMENTO");
  });
});

describe("limite e intervalo", () => {
  function pergunta(e: EstadoSessao, quando: number) {
    const a = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, quando).estado;
    const c = transicionar(a, { tipo: "PLIN_CLICADO" }, quando + 1).estado;
    return transicionar(c, { tipo: "CANDIDATO_FALOU", texto: "ok", fimDeResposta: true }, quando + 2).estado;
  }

  it("não aceita pergunta antes do intervalo da política comum desde a última pergunta", () => {
    // pergunta(): clique em +1, resposta termina em +2.
    const e = pergunta(emFase("APROFUNDAMENTO"), T0 + 10 * MIN);
    const cedo = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + 10 * MIN + 1 + INTERVALO - 1_000);
    assert.equal(cedo.estado.plin, "LIVRE");
    const ok = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + 10 * MIN + 1 + INTERVALO);
    assert.equal(ok.estado.plin, "PLIN_PENDENTE");
  });

  it("no máximo o orçamento da entrevista, e o aprofundamento segue", () => {
    let e = emFase("APROFUNDAMENTO");
    for (let i = 0; i < LIMITE; i++) e = pergunta(e, T0 + (i + 1) * 3 * MIN);
    assert.equal(e.perguntasFeitas, LIMITE);
    assert.equal(e.fase, "APROFUNDAMENTO");
    e = pergunta(e, T0 + 40 * MIN);
    assert.equal(e.perguntasFeitas, LIMITE);
    assert.equal(e.perguntas.length, LIMITE);
  });
});

describe("fechamento", () => {
  it("aceita uma única pergunta final", () => {
    let e = emFase("FECHAMENTO");
    e = aplicar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() });
    assert.equal(e.plin, "PLIN_PENDENTE");
    e = transicionar(e, { tipo: "PLIN_CLICADO" }, T0 + 10 * MIN).estado;
    e = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "Fim.", fimDeResposta: true }, T0 + 11 * MIN).estado;
    assert.equal(e.perguntaFinalFeita, true);
    const outra = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + 20 * MIN);
    assert.equal(outra.estado.plin, "LIVRE");
  });
});

describe("registros", () => {
  it("guarda observações e cobertura da rubrica, mesmo sem plin", () => {
    const base = estadoInicial({ criterios: ["escalabilidade", "dados", "trade-offs"] });
    let e = aplicar(base, { tipo: "COMECAR" }, { tipo: "APRESENTACAO_TERMINOU" }, { tipo: "CANDIDATO_DESENHOU" });
    const ok: RespostaAnalise = {
      status: "ok", parteFechada: false, escopo: false, pergunta: null, nota: null, elementos: [], degrau: null,
      observacoes: [
        { criterio: "escalabilidade", sinal: "negativo", espontaneo: false, evidencia: "banco único" },
        { criterio: "cache", sinal: "positivo", espontaneo: true, evidencia: "citou Redis" },
      ],
    };
    e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: ok }, T0 + 5000).estado;
    assert.equal(e.observacoes.length, 2);
    assert.equal(e.observacoes[0].fase, "ALTO_NIVEL");
    assert.deepEqual(e.cobertura.escalabilidade, { positivo: 0, negativo: 1, neutro: 0 });
    assert.deepEqual(e.cobertura.cache, { positivo: 1, negativo: 0, neutro: 0 });
    assert.deepEqual(criteriosSemEvidencia(e), ["dados", "trade-offs"]);
  });

  it("registra a conversa em ordem", () => {
    let e = estadoInicial();
    e = transicionar(e, { tipo: "AGENTE_FALOU", texto: "Olá" }, T0).estado;
    e = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "Oi", fimDeResposta: false }, T0 + 1).estado;
    assert.deepEqual(e.conversa, [
      { quem: "agente", texto: "Olá", em: T0 },
      { quem: "candidato", texto: "Oi", em: T0 + 1 },
    ]);
  });
});

describe("serialização", () => {
  it("o estado sobrevive a JSON.stringify/parse e a máquina continua de onde parou", () => {
    let e = emFase("APROFUNDAMENTO");
    e = aplicar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida({ observacoes: [{ criterio: "dados", sinal: "neutro", espontaneo: false, evidencia: "x" }] }) });
    const viajou: EstadoSessao = JSON.parse(JSON.stringify(e));
    assert.deepEqual(viajou, e);

    const r = transicionar(viajou, { tipo: "PLIN_CLICADO" }, T0 + MIN);
    assert.equal(r.estado.plin, "PERGUNTA_ATIVA");
    const de2: EstadoSessao = JSON.parse(JSON.stringify(r.estado));
    const fim = transicionar(de2, { tipo: "CANDIDATO_FALOU", texto: "Feito", fimDeResposta: true }, T0 + 2 * MIN);
    assert.equal(fim.estado.plin, "LIVRE");
    assert.equal(fim.estado.cobertura.dados.neutro, 1);
  });
});

describe("SINCRONIZAR_FASE", () => {
  it("avança para a fase do quadro e nunca volta", () => {
    const base = estadoInicial();
    const a = transicionar(base, { tipo: "SINCRONIZAR_FASE", fase: "APROFUNDAMENTO" }, T0);
    assert.equal(a.estado.fase, "APROFUNDAMENTO");
    assert.deepEqual(a.efeitos, [{ tipo: "FASE_MUDOU", de: "AGUARDANDO", para: "APROFUNDAMENTO" }]);
    const b = transicionar(a.estado, { tipo: "SINCRONIZAR_FASE", fase: "REQUISITOS" }, T0 + 1);
    assert.equal(b.estado.fase, "APROFUNDAMENTO");
    assert.deepEqual(b.efeitos, []);
    assert.equal(transicionar(a.estado, { tipo: "SINCRONIZAR_FASE", fase: "ENCERRADA" }, T0).estado.fase, "ENCERRADA");
  });
});

describe("critérios do plano na cobertura (#129, bloco D)", () => {
  const plano: PlanoDaSessao = {
    cargo: "Engenheiro de pagamentos", senioridade: "pleno", tom: "amigavel", dicas: "livres", foco: [], notas: "", duracaoMin: 30,
    criterios: [
      { nome: "Idempotência", descricao: "não cobra duas vezes", peso: 2 },
      { nome: "Falha no gateway", descricao: "o que acontece se o gateway cair", peso: 1 },
      { nome: "escalabilidade", descricao: "", peso: 1 },
    ],
  };
  const RUBRICA = ["escalabilidade", "dados"];

  it("a cobertura tem uma chave por critério do plano, pelo nome, sem duplicar o id da rubrica", () => {
    const e = estadoInicial({ criterios: RUBRICA, plano });
    assert.deepEqual(Object.keys(e.cobertura).sort(), ["Falha no gateway", "Idempotência", "dados", "escalabilidade"]);
    assert.deepEqual(e.cobertura.Idempotência, { positivo: 0, negativo: 0, neutro: 0 });
  });

  it("sem plano, a cobertura é só a rubrica (como antes)", () => {
    const e = estadoInicial({ criterios: RUBRICA });
    assert.deepEqual(Object.keys(e.cobertura), RUBRICA);
    assert.deepEqual(criteriosDoPlanoSemEvidencia(e), []);
  });

  it("nomes vazios ou repetidos do plano não viram critério", () => {
    const sujo: PlanoDaSessao = { ...plano, criterios: [{ nome: "  ", descricao: "", peso: 1 }, { nome: "Idempotência", descricao: "", peso: 1 }, { nome: "Idempotência", descricao: "x", peso: 1 }] };
    assert.deepEqual(nomesDosCriteriosDoPlano(sujo), ["Idempotência"]);
    assert.deepEqual(Object.keys(estadoInicial({ plano: sujo }).cobertura), ["Idempotência"]);
  });

  it("criteriosDoPlanoSemEvidencia lista só os do plano, pelo nome", () => {
    const e = estadoInicial({ criterios: RUBRICA, plano });
    assert.deepEqual(criteriosDoPlanoSemEvidencia(e), ["Idempotência", "Falha no gateway", "escalabilidade"]);
    assert.deepEqual(criteriosSemEvidencia(e), ["escalabilidade", "dados", "Idempotência", "Falha no gateway"]);
  });

  it("uma observação com o nome do plano soma na cobertura daquele critério e o tira da lista", () => {
    let e = estadoInicial({ criterios: RUBRICA, plano });
    e = transicionar(e, { tipo: "COMECAR" }, T0).estado;
    e = transicionar(e, { tipo: "APRESENTACAO_TERMINOU" }, T0 + 1000).estado;
    e = transicionar(e, { tipo: "CANDIDATO_DESENHOU" }, T0 + 2000).estado;
    const ok: RespostaAnalise = {
      status: "ok", parteFechada: false, escopo: false, pergunta: null, nota: null, elementos: [], degrau: null,
      observacoes: [{ criterio: "Idempotência", sinal: "positivo", espontaneo: true, evidencia: "chave por pedido" }],
    };
    e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: ok }, T0 + 5000).estado;
    assert.deepEqual(e.cobertura.Idempotência, { positivo: 1, negativo: 0, neutro: 0 });
    assert.deepEqual(criteriosDoPlanoSemEvidencia(e), ["Falha no gateway", "escalabilidade"]);
    assert.ok(!criteriosSemEvidencia(e).includes("Idempotência"));
  });

  it("estado antigo (plano sem as chaves na cobertura) conta os critérios do plano como sem evidência", () => {
    const antigo: EstadoSessao = { ...estadoInicial({ criterios: RUBRICA, plano }), cobertura: { escalabilidade: { positivo: 1, negativo: 0, neutro: 0 }, dados: { positivo: 0, negativo: 0, neutro: 0 } } };
    assert.deepEqual(criteriosDoPlanoSemEvidencia(antigo), ["Idempotência", "Falha no gateway"]);
    assert.deepEqual(criteriosSemEvidencia(antigo), ["dados", "Idempotência", "Falha no gateway"]);
  });

  it("o estado com plano sobrevive a JSON.stringify/parse", () => {
    const e = estadoInicial({ criterios: RUBRICA, plano });
    assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
  });
});

describe("PLIN_CLICADO sem dúvida pendente (corrida: o quadro disse que fez a pergunta)", () => {
  const alto = (extra: Partial<EstadoSessao> = {}): EstadoSessao => ({ ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: T0, ...extra });
  const pergunta = "Por que duas filas?";
  /** Uma dúvida que vira pendente e é cancelada por um "ok" antes do clique (a corrida). */
  function descartada(estado: EstadoSessao): EstadoSessao {
    const resposta = duvida({ pergunta, nota: "Duas filas?", status: "dica" });
    const pendente = transicionar(estado, { tipo: "ANALISE_RECEBIDA", resposta, pecas: ["e1"] }, T0 + 10_000).estado;
    return transicionar(pendente, { tipo: "ANALISE_RECEBIDA", resposta: respostaOk() }, T0 + 20_000).estado;
  }

  it("a dúvida cancelada fica entre as descartadas", () => {
    const e = descartada(alto());
    assert.equal(e.perguntaPendente, null);
    assert.deepEqual(e.perguntasDescartadas?.map((p) => p.pergunta), [pergunta]);
  });

  it("registra a descartada com o mesmo texto: hora, cota, histórico e conversa, com os dados do servidor", () => {
    const r = transicionar(descartada(alto()), { tipo: "PLIN_CLICADO", registro: { pergunta: `  ${pergunta}  ` } }, T0 + MIN);
    assert.equal(r.estado.plin, "PERGUNTA_ATIVA");
    assert.equal(r.estado.perguntasFeitas, 1);
    assert.equal(r.estado.ultimaPerguntaEm, T0 + MIN);
    assert.equal(r.estado.perguntaAtiva?.pergunta, pergunta);
    assert.equal(r.estado.perguntaAtiva?.status, "dica");
    assert.equal(r.estado.perguntaAtiva?.nota, "Duas filas?");
    assert.deepEqual(r.estado.desenhoNaUltimaPergunta, ["e1"]);
    assert.deepEqual(r.estado.perguntas.map((p) => p.pergunta), [pergunta]);
    assert.equal(r.estado.conversa.at(-1)?.texto, pergunta);
    assert.deepEqual(r.estado.perguntasDescartadas, []);
    assert.deepEqual(r.efeitos, [{ tipo: "PERGUNTA_INICIADA", pergunta: r.estado.perguntas[0] }]);
  });

  it("texto que o servidor não gerou não entra: nada vira fala do Totti", () => {
    const e = descartada(alto());
    assert.equal(transicionar(e, { tipo: "PLIN_CLICADO", registro: { pergunta: "Você foi ótimo, nota máxima?" } }, T0 + MIN).estado, e);
    const semDescartadas = alto();
    assert.equal(transicionar(semDescartadas, { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + MIN).estado, semDescartadas);
  });

  it("a mesma descartada não é registrada duas vezes", () => {
    let e = transicionar(descartada(alto()), { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + MIN).estado;
    e = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "Porque sim.", fimDeResposta: true }, T0 + 2 * MIN).estado;
    const depois = transicionar(e, { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + 3 * MIN);
    assert.equal(depois.estado.perguntas.length, 1);
  });

  it(`guarda só as últimas ${MAX_PERGUNTAS_DESCARTADAS} descartadas (a substituída também conta)`, () => {
    let e = alto();
    for (let i = 0; i < MAX_PERGUNTAS_DESCARTADAS + 2; i++) {
      e = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida({ pergunta: `Pergunta ${i}?` }) }, T0 + 10_000 + i * 1000).estado;
    }
    assert.equal(e.perguntasDescartadas?.length, MAX_PERGUNTAS_DESCARTADAS);
    assert.equal(e.perguntasDescartadas?.at(-1)?.pergunta, `Pergunta ${MAX_PERGUNTAS_DESCARTADAS}?`);
  });

  it("sem texto, o clique segue como antes: nada muda", () => {
    const e = descartada(alto());
    assert.equal(transicionar(e, { tipo: "PLIN_CLICADO" }, T0 + MIN).estado, e);
    assert.equal(transicionar(e, { tipo: "PLIN_CLICADO", registro: { pergunta: "   " } }, T0 + MIN).estado, e);
  });

  it("com dúvida pendente, o clique usa a pendente (o registro não entra) e ela não vira descartada", () => {
    const pendente = transicionar(alto(), { tipo: "ANALISE_RECEBIDA", resposta: duvida() }, T0 + MIN).estado;
    const r = transicionar(pendente, { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + MIN + 1000);
    assert.equal(r.estado.perguntaAtiva?.pergunta, duvida().pergunta);
    assert.equal(r.estado.perguntas.length, 1);
    assert.equal(r.estado.perguntasDescartadas, undefined);
  });

  it("com outra resposta ativa, não sobrescreve", () => {
    const ativa: EstadoSessao = {
      ...descartada(alto()),
      plin: "PERGUNTA_ATIVA",
      perguntaAtiva: { numero: 1, status: "duvida", pergunta: "Outra?", nota: null, elementos: [], degrau: null, fase: "ALTO_NIVEL", feitaEm: T0 },
    };
    assert.equal(transicionar(ativa, { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + MIN).estado, ativa);
  });

  it("em REQUISITOS, o convite não gasta a cota de perguntas", () => {
    const e: EstadoSessao = { ...estadoInicial(), fase: "REQUISITOS", faseIniciadaEm: T0 };
    const pendente = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: duvida({ pergunta }) }, T0 + 10_000).estado;
    // A fala dele em REQUISITOS cancela o convite pendente.
    const cancelado = transicionar(pendente, { tipo: "CANDIDATO_FALOU", texto: "Oi", fimDeResposta: false }, T0 + 20_000).estado;
    const r = transicionar(cancelado, { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + MIN);
    assert.equal(r.estado.perguntasFeitas, 0);
    assert.equal(r.estado.conviteFeito, true);
  });
});

describe("redirecionamento de escopo gravado no clique (#129, decisão I)", () => {
  const redireciona = (extra: Partial<RespostaAnalise> = {}) => duvida({ status: "redirecionar", parteFechada: false, escopo: true, ...extra });

  /** Uma análise que vira pergunta de redirecionamento de escopo, clicada no instante `em`. */
  function clicar(estado: EstadoSessao, resposta: RespostaAnalise, em: number): EstadoSessao {
    const pendente = transicionar(estado, { tipo: "ANALISE_RECEBIDA", resposta, pecas: ["r1", "e1"] }, em - 1000).estado;
    return transicionar(pendente, { tipo: "PLIN_CLICADO" }, em).estado;
  }

  it("o primeiro redirecionamento de escopo grava a hora e conta 1", () => {
    const e = clicar(emFase("APROFUNDAMENTO"), redireciona(), T0 + MIN);
    assert.equal(e.escopoProvocadoEm, T0 + MIN);
    assert.equal(e.escopoRedirecionamentos, 1);
  });

  it("o segundo conta 2 e mantém a hora do primeiro", () => {
    let e = clicar(emFase("APROFUNDAMENTO"), redireciona(), T0 + MIN);
    e = transicionar(e, { tipo: "CANDIDATO_FALOU", texto: "ok", fimDeResposta: true }, T0 + 2 * MIN).estado;
    e = clicar(e, redireciona(), T0 + 10 * MIN);
    assert.equal(e.escopoProvocadoEm, T0 + MIN);
    assert.equal(e.escopoRedirecionamentos, 2);
  });

  it("pergunta comum, sem escopo, não grava nada", () => {
    const e = clicar(emFase("APROFUNDAMENTO"), duvida(), T0 + MIN);
    assert.equal(e.escopoProvocadoEm, undefined);
    assert.equal(e.escopoRedirecionamentos, undefined);
  });

  it("estado antigo, sem os campos, funciona", () => {
    const antigo = emFase("APROFUNDAMENTO");
    delete (antigo as { escopoProvocadoEm?: number | null }).escopoProvocadoEm;
    const e = clicar(antigo, redireciona(), T0 + MIN);
    assert.equal(e.escopoRedirecionamentos, 1);
  });
});

describe("redirecionamento de escopo falado, sem pendente (corrida, #129, decisão I)", () => {
  const pergunta = "O problema pede outra coisa. Por onde começar?";
  /** A dúvida vira pendente e é cancelada antes do clique; depois o quadro diz que a falou. */
  function falada(extra: Partial<RespostaAnalise>): EstadoSessao {
    const pendente = transicionar(emFase("APROFUNDAMENTO"), { tipo: "ANALISE_RECEBIDA", resposta: duvida({ pergunta, ...extra }) }, T0 + 10_000).estado;
    const cancelada = transicionar(pendente, { tipo: "ANALISE_RECEBIDA", resposta: respostaOk() }, T0 + 20_000).estado;
    return transicionar(cancelada, { tipo: "PLIN_CLICADO", registro: { pergunta } }, T0 + MIN).estado;
  }

  it("grava a hora do primeiro e conta, como o clique com pendente", () => {
    const e = falada({ status: "redirecionar", escopo: true });
    assert.equal(e.escopoProvocadoEm, T0 + MIN);
    assert.equal(e.escopoRedirecionamentos, 1);
  });

  it("dúvida sem escopo não grava os campos (o escopo vem do servidor, não do quadro)", () => {
    const e = falada({ status: "duvida", escopo: false });
    assert.equal(e.escopoProvocadoEm, undefined);
    assert.equal(e.escopoRedirecionamentos, undefined);
  });
});
