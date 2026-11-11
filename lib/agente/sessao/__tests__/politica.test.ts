import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SILENCIO_INICIAL_S, SILENCIO_REQUISITOS_S } from "../../../contracts";
import { intervaloMinimoMs, orcamentoDeInterrupcoes, RITMO } from "../../../interrupcao/politica";
import { estadoInicial, transicionar, type EstadoSessao } from "../estado";
import {
  extrairIdsDoGrafo,
  filtrarResposta,
  motivoBloqueio,
  motivoBloqueioPlin,
  podeAnalisar,
  podeLevantarPlin,
  REGRAS_PADRAO,
  statusPermitido,
} from "../politica";
import { FASES, STATUS_ANALISE, type Fase, type RespostaAnalise } from "../tipos";

const AGORA = 10_000_000;
const MIN = 60_000;
/** Orçamento e intervalo da política comum para a entrevista padrão (35 min): os mesmos no quadro e no live coding. */
const LIMITE = orcamentoDeInterrupcoes(35);
const INTERVALO = intervaloMinimoMs(35);

function estadoEm(fase: Fase, extra: Partial<EstadoSessao> = {}): EstadoSessao {
  return { ...estadoInicial(), fase, faseIniciadaEm: 0, ...extra };
}

function resposta(extra: Partial<RespostaAnalise> = {}): RespostaAnalise {
  return {
    status: "duvida",
    pergunta: "Onde fica o gargalo?",
    nota: "Gargalo?",
    elementos: ["e1"],
    degrau: null,
    observacoes: [],
    ...extra,
  };
}

const GRAFO = "COMPONENTES\n- [r1] Cliente (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] Cliente → Postgres";
const IDS = extrairIdsDoGrafo(GRAFO);

describe("REQUISITOS: silêncio inicial decidido no servidor (#83)", () => {
  const inicio = AGORA - SILENCIO_INICIAL_S * 1000;
  const e = () => estadoEm("REQUISITOS", { faseIniciadaEm: inicio });

  it("espera 120 segundos desde a fase, inclusive sem telemetria do navegador", () => {
    assert.equal(motivoBloqueioPlin(e(), AGORA - 1), "SILENCIO_INICIAL_INSUFICIENTE");
    assert.equal(motivoBloqueioPlin(e(), AGORA), null);
    assert.equal(motivoBloqueioPlin({ ...e(), faseIniciadaEm: null }, AGORA), "SILENCIO_INICIAL_INSUFICIENTE");
  });

  it("fala ou texto durante a fase bloqueia mesmo após longo silêncio e em estado antigo", () => {
    for (const em of [inicio, inicio + 1, AGORA - 1]) {
      const estado = { ...e(), conversa: [{ quem: "candidato" as const, texto: "Tá bom", em }] };
      assert.equal(motivoBloqueioPlin(estado, AGORA), "CANDIDATO_JA_FALOU");
      assert.equal(motivoBloqueioPlin(estado, AGORA + 600_000), "CANDIDATO_JA_FALOU");
      assert.equal(podeAnalisar(estado), true, "observações continuam sendo colhidas");
      assert.equal(estado.conviteFeito, false, "a política é pura");
    }
  });

  it("fala anterior à fase, fala do agente e marcador vazio não impedem o convite", () => {
    const estado = { ...e(), conversa: [
      { quem: "candidato" as const, texto: "Oi", em: inicio - 1 },
      { quem: "agente" as const, texto: "Este é o desafio", em: inicio },
      { quem: "candidato" as const, texto: "  ", em: inicio + 1 },
    ] };
    assert.equal(motivoBloqueioPlin(estado, AGORA), null);
  });

  it("atividade recente informada pelo quadro segura o convite antes de a fala ser persistida", () => {
    assert.equal(motivoBloqueioPlin(e(), AGORA, undefined, { paradoHaS: SILENCIO_REQUISITOS_S - 0.001 }), "CANDIDATO_EM_ATIVIDADE");
    assert.equal(motivoBloqueioPlin(e(), AGORA, undefined, { paradoHaS: SILENCIO_REQUISITOS_S }), null);
  });

  it("qualquer elemento no grafo impede o convite, preservando observações", () => {
    const observacoes = [{ criterio: "requisitos", sinal: "neutro" as const, espontaneo: true, evidencia: "Começou pelo desenho" }];
    for (const grafo of [GRAFO, 'ANOTAÇÕES SOLTAS\n- [t1] escala', 'DESENHOS SEM TEXTO\n- [f1] traço livre']) {
      assert.equal(motivoBloqueioPlin(e(), AGORA, undefined, { temDesenho: true }), "CANDIDATO_JA_DESENHOU");
      const r = filtrarResposta(e(), resposta({ observacoes }), extrairIdsDoGrafo(grafo), AGORA);
      assert.equal(r.status, "ok");
      assert.equal(r.pergunta, null);
      assert.deepEqual(r.observacoes, observacoes);
    }
  });
});

describe("gestos da análise", () => {
  it("preserva gestos válidos e retira uma comparação com alvo inexistente", () => {
    const r = filtrarResposta(estadoEm("APROFUNDAMENTO"), resposta({ visual: [
      { tipo: "percorrer", alvos: ["r1", "s1", "e1"] }, { tipo: "comparar", alvos: ["r1", "inventado"] },
    ] }), IDS, AGORA);
    assert.deepEqual(r.visual, [{ tipo: "percorrer", alvos: ["r1", "s1", "e1"] }]);
  });
  it("política que adia a intervenção também silencia seus desenhos", () => {
    const r = filtrarResposta(estadoEm("APROFUNDAMENTO", { perguntasFeitas: LIMITE }), resposta({ visual: [{ tipo: "circular", alvo: "e1" }] }), IDS, AGORA);
    assert.equal(r.status, "ok");
    assert.deepEqual(r.visual, []);
  });
});

describe("statusPermitido: matriz fase x status", () => {
  const esperado: Record<Fase, Record<string, boolean>> = {
    AGUARDANDO: { ok: true, duvida: false, redirecionar: false, dica: false },
    APRESENTACAO: { ok: true, duvida: false, redirecionar: false, dica: false },
    REQUISITOS: { ok: true, duvida: true, redirecionar: false, dica: false },
    ALTO_NIVEL: { ok: true, duvida: true, redirecionar: true, dica: true },
    APROFUNDAMENTO: { ok: true, duvida: true, redirecionar: true, dica: true },
    FECHAMENTO: { ok: true, duvida: true, redirecionar: false, dica: false },
    ENCERRADA: { ok: true, duvida: false, redirecionar: false, dica: false },
  };
  for (const fase of FASES) {
    for (const status of STATUS_ANALISE) {
      it(`${fase} / ${status} = ${esperado[fase][status]}`, () => {
        assert.equal(statusPermitido(fase, status), esperado[fase][status]);
      });
    }
  }
});

describe("podeAnalisar (portão de entrada)", () => {
  it("só nas fases que analisam", () => {
    const analisam: Fase[] = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];
    for (const fase of FASES) {
      assert.equal(podeAnalisar(estadoEm(fase), AGORA), analisam.includes(fase), fase);
    }
    assert.equal(motivoBloqueio(estadoEm("APRESENTACAO")), "FASE_NAO_ANALISA");
    assert.equal(motivoBloqueio(estadoEm("REQUISITOS")), null);
  });

  it("não roda com o candidato no meio da resposta", () => {
    const e = estadoEm("APROFUNDAMENTO", { plin: "PERGUNTA_ATIVA" });
    assert.equal(motivoBloqueio(e), "CANDIDATO_RESPONDENDO");
  });

  it("uma dúvida pendente não bloqueia (a análise pode substituí-la ou cancelá-la)", () => {
    const e = estadoEm("APROFUNDAMENTO", { plin: "PLIN_PENDENTE" });
    assert.equal(podeAnalisar(e, AGORA), true);
  });

  it("intervalo e limite NÃO bloqueiam a análise (só o plin)", () => {
    assert.equal(podeAnalisar(estadoEm("APROFUNDAMENTO", { perguntasFeitas: 1, ultimaPerguntaEm: AGORA - 1000 }), AGORA), true);
    assert.equal(podeAnalisar(estadoEm("APROFUNDAMENTO", { perguntasFeitas: LIMITE }), AGORA), true);
    assert.equal(podeAnalisar(estadoEm("FECHAMENTO", { perguntasFeitas: 6, perguntaFinalFeita: true }), AGORA), true);
  });
});

describe("motivoBloqueioPlin (política comum: orçamento, cota e intervalo)", () => {
  it("intervalo desde a última pergunta", () => {
    const base = { perguntasFeitas: 1 };
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { ...base, ultimaPerguntaEm: AGORA - INTERVALO + 1 }), AGORA), "INTERVALO_ENTRE_PERGUNTAS");
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { ...base, ultimaPerguntaEm: AGORA - INTERVALO }), AGORA), null);
  });

  it("orçamento escalado pela duração (35 min no padrão)", () => {
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { perguntasFeitas: LIMITE - 1 }), AGORA), null);
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { perguntasFeitas: LIMITE }), AGORA), "LIMITE_DE_PERGUNTAS");
  });

  it("cota proporcional ao tempo: não gasta o orçamento no começo", () => {
    // Aos 4 de 35 min, a cota é 3.
    assert.equal(motivoBloqueioPlin(estadoEm("ALTO_NIVEL", { iniciadaEm: AGORA - 4 * MIN, perguntasFeitas: 3 }), AGORA), "COTA_DO_TEMPO");
  });

  it("começo do aprofundamento é marco: basta o respiro curto", () => {
    const base = { perguntasFeitas: 2, ultimaPerguntaEm: AGORA - 60_000, ultimaRespostaEm: AGORA - 20_000 };
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", base), AGORA), "INTERVALO_ENTRE_PERGUNTAS");
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { ...base, faseIniciadaEm: AGORA - 5_000 }), AGORA), null);
  });

  it("FECHAMENTO: uma pergunta final, mesmo depois do orçamento", () => {
    assert.equal(motivoBloqueioPlin(estadoEm("FECHAMENTO", { perguntasFeitas: LIMITE }), AGORA), null);
    assert.equal(motivoBloqueioPlin(estadoEm("FECHAMENTO", { perguntasFeitas: LIMITE + 1, perguntaFinalFeita: true }), AGORA), "LIMITE_DE_PERGUNTAS");
  });
});

describe("podeLevantarPlin", () => {
  it("combina status da fase com o portão", () => {
    assert.equal(podeLevantarPlin(estadoEm("APROFUNDAMENTO"), "dica", AGORA), true);
    assert.equal(podeLevantarPlin(estadoEm("ALTO_NIVEL"), "dica", AGORA), true);
    assert.equal(podeLevantarPlin(estadoEm("REQUISITOS"), "dica", AGORA), false);
    assert.equal(podeLevantarPlin(estadoEm("APROFUNDAMENTO"), "ok", AGORA), false);
    assert.equal(podeLevantarPlin(estadoEm("APROFUNDAMENTO", { perguntasFeitas: LIMITE }), "duvida", AGORA), false);
  });
});

describe("filtrarResposta", () => {
  const e = estadoEm("APROFUNDAMENTO");

  it("deixa passar uma resposta válida", () => {
    const r = filtrarResposta(e, resposta(), IDS, AGORA);
    // A pergunta cita uma peça e o modelo não pediu gesto: a peça é marcada mesmo assim.
    assert.deepEqual(r, { ...resposta(), visual: [{ tipo: "marcar", alvo: "e1" }], avancar_fase: false });
  });

  it("avancar_fase só vale em ALTO_NIVEL, mesmo quando o plin é rebaixado", () => {
    const pronto = resposta({ status: "ok", pergunta: null, nota: null, elementos: [], avancar_fase: true });
    assert.equal(filtrarResposta(estadoEm("ALTO_NIVEL"), pronto, IDS, AGORA).avancar_fase, true);
    for (const fase of ["REQUISITOS", "APROFUNDAMENTO", "FECHAMENTO"] as const) {
      assert.equal(filtrarResposta(estadoEm(fase), pronto, IDS, AGORA).avancar_fase, false);
    }
    // Pergunta que a política barra (aqui, limite de perguntas) vira ok, mas o sinal de prontidão continua.
    const comDuvida = resposta({ status: "duvida", avancar_fase: true });
    const r = filtrarResposta(estadoEm("ALTO_NIVEL", { perguntasFeitas: LIMITE }), comDuvida, IDS, AGORA);
    assert.equal(r.status, "ok");
    assert.equal(r.avancar_fase, true);
  });

  it("rebaixa para ok o status que a fase não permite, mantendo observações", () => {
    const obs = [{ criterio: "dados", sinal: "negativo" as const, espontaneo: false, evidencia: "x" }];
    const r = filtrarResposta(estadoEm("REQUISITOS"), resposta({ status: "dica", observacoes: obs }), IDS, AGORA);
    assert.equal(r.status, "ok");
    assert.equal(r.pergunta, null);
    assert.equal(r.nota, null);
    assert.deepEqual(r.elementos, []);
    assert.deepEqual(r.observacoes, obs);
  });

  it("REQUISITOS: analisa; só `duvida` (convite) vira plin; outros status e observações ficam como ok", () => {
    const obs = [{ criterio: "requisitos", sinal: "positivo" as const, espontaneo: true, evidencia: "perguntou a escala" }];
    assert.equal(podeAnalisar(estadoEm("REQUISITOS"), AGORA), true);
    assert.equal(podeLevantarPlin(estadoEm("REQUISITOS"), "duvida", AGORA), true);
    assert.equal(podeLevantarPlin(estadoEm("REQUISITOS"), "redirecionar", AGORA), false);
    const r = filtrarResposta(estadoEm("REQUISITOS"), resposta({ status: "redirecionar", observacoes: obs }), IDS, AGORA);
    assert.equal(r.status, "ok");
    assert.deepEqual(r.observacoes, obs);
  });

  it("rebaixa por limite e por intervalo", () => {
    assert.equal(filtrarResposta(estadoEm("APROFUNDAMENTO", { perguntasFeitas: LIMITE }), resposta(), IDS, AGORA).status, "ok");
    assert.equal(filtrarResposta(estadoEm("APROFUNDAMENTO", { ultimaPerguntaEm: AGORA - 10_000 }), resposta(), IDS, AGORA).status, "ok");
  });

  it("rebaixa quando há plin mas não há pergunta", () => {
    assert.equal(filtrarResposta(e, resposta({ pergunta: null }), IDS, AGORA).status, "ok");
    assert.equal(filtrarResposta(e, resposta({ pergunta: "   " }), IDS, AGORA).status, "ok");
  });

  it("ok limpa qualquer lixo de pergunta/elementos", () => {
    const r = filtrarResposta(e, resposta({ status: "ok", pergunta: "sobra", elementos: ["e1"] }), IDS, AGORA);
    assert.equal(r.pergunta, null);
    assert.deepEqual(r.elementos, []);
  });

  it("descarta ids que não existem no grafo (e repetidos)", () => {
    const r = filtrarResposta(e, resposta({ elementos: ["e1", "zzz", "s1", "e1"] }), IDS, AGORA);
    assert.deepEqual(r.elementos, ["e1", "s1"]);
  });

  it("sem nenhum id válido, devolve lista vazia (nota ao lado do desenho)", () => {
    assert.deepEqual(filtrarResposta(e, resposta({ elementos: ["x9"] }), IDS, AGORA).elementos, []);
  });

  it("corta a nota em ~40 caracteres", () => {
    const longa = "Essa nota é muito maior do que o cursor consegue escrever no quadro";
    const r = filtrarResposta(e, resposta({ nota: longa }), IDS, AGORA);
    assert.ok(r.nota!.length <= 40);
    assert.ok(longa.startsWith(r.nota!));
  });

  it("sem nota, usa a pergunta cortada", () => {
    const r = filtrarResposta(e, resposta({ nota: null, pergunta: "Com leitura cem vezes maior que escrita, onde fica o gargalo?" }), IDS, AGORA);
    assert.equal(r.nota, "Com leitura cem vezes maior que escrita,");
  });

  it("não modifica o objeto original", () => {
    const original = resposta({ elementos: ["e1", "zzz"] });
    filtrarResposta(e, original, IDS, AGORA);
    assert.deepEqual(original.elementos, ["e1", "zzz"]);
  });
});

describe("extrairIdsDoGrafo", () => {
  it("pega os ids de todas as seções", () => {
    const grafo = `${GRAFO}\nANOTAÇÕES SOLTAS\n- [t1] "algo"\nORDEM NA TELA (esquerda → direita)\n- Cliente, Postgres`;
    assert.deepEqual([...extrairIdsDoGrafo(grafo)].sort(), ["e1", "r1", "s1", "t1"]);
  });
});

describe("a bola está com o candidato depois de uma fala solta do agente", () => {
  const base = { plin: "LIVRE" as const };
  const falou = () => transicionar(estadoEm("APROFUNDAMENTO", base), { tipo: "AGENTE_FALOU", texto: "São 20 mil por dia. Pode seguir com o desenho." }, AGORA).estado;
  const regras = REGRAS_PADRAO;

  it("a fala do agente registra a hora", () => {
    assert.equal(falou().ultimaFalaDoAgenteEm, AGORA);
  });

  it("sem o candidato agir depois da fala, a pergunta nova espera", () => {
    // Ele não faz nada há 30 s (a última ação é anterior à fala) e o agente falou há 3 s.
    assert.equal(motivoBloqueioPlin(falou(), AGORA + 3_000, regras, { paradoHaS: 30 }), "BOLA_COM_O_CANDIDATO");
    assert.equal(podeLevantarPlin(falou(), "duvida", AGORA + 3_000, regras, { paradoHaS: 30 }), false);
  });

  it("se o candidato agiu depois da fala, a pergunta pode sair na hora", () => {
    // Agente falou em AGORA; ele mexeu no desenho 1 s depois (parado há 2 s quando se pergunta em AGORA + 3 s).
    assert.equal(motivoBloqueioPlin(falou(), AGORA + 3_000, regras, { paradoHaS: 2 }), null);
  });

  it("sem ação dele, um silêncio de verdade (o limite que já quebra o silêncio) libera a pergunta", () => {
    assert.equal(motivoBloqueioPlin(falou(), AGORA + 8_000 - 1, regras, { paradoHaS: 60 }), "BOLA_COM_O_CANDIDATO");
    assert.equal(motivoBloqueioPlin(falou(), AGORA + 8_000, regras, { paradoHaS: 60 }), null);
  });

  it("em REQUISITOS o silêncio que libera é o inicial, mais longo", () => {
    const req = transicionar(estadoEm("REQUISITOS", base), { tipo: "AGENTE_FALOU", texto: "Uns 4 mil por segundo." }, AGORA).estado;
    assert.equal(motivoBloqueioPlin(req, AGORA + 10_000, regras, { paradoHaS: 60 }), "BOLA_COM_O_CANDIDATO");
    assert.equal(motivoBloqueioPlin(req, AGORA + 15_000, regras, { paradoHaS: 60 }), null);
  });

  it("sem saber há quanto tempo ele está parado, a regra não se aplica", () => {
    assert.equal(motivoBloqueioPlin(falou(), AGORA + 1_000), null);
  });

  it("estado guardado antes do campo não bloqueia nada", () => {
    assert.equal(estadoEm("APROFUNDAMENTO", base).ultimaFalaDoAgenteEm, undefined);
    assert.equal(motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", base), AGORA, regras, { paradoHaS: 60 }), null);
  });

  it("filtrarResposta rebaixa a pergunta enquanto a bola está com ele", () => {
    const ids = new Set(["e1"]);
    const r = resposta({ elementos: ["e1"] });
    assert.equal(filtrarResposta(falou(), r, ids, AGORA + 3_000, regras, { paradoHaS: 30 }).status, "ok");
    assert.equal(filtrarResposta(falou(), r, ids, AGORA + 3_000, regras, { paradoHaS: 2 }).status, "duvida");
  });

  it("o intervalo entre perguntas continua valendo por conta própria", () => {
    assert.equal(
      motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { ...base, ultimaPerguntaEm: AGORA - 10_000 }), AGORA),
      "INTERVALO_ENTRE_PERGUNTAS",
    );
  });
});

describe("intervalo entre perguntas: referência de tempo", () => {
  const base = { perguntasFeitas: 1 };
  const motivo = (extra: Partial<EstadoSessao>, agora: number) =>
    motivoBloqueioPlin(estadoEm("APROFUNDAMENTO", { ...base, ...extra }), agora);

  it("o respiro conta do fim da resposta quando ele é mais recente que o início da pergunta", () => {
    const e = { ultimaPerguntaEm: AGORA - 5 * MIN, ultimaRespostaEm: AGORA - 10_000 };
    assert.equal(motivo(e, AGORA), "INTERVALO_ENTRE_PERGUNTAS");
    assert.equal(motivo(e, AGORA - 10_000 + RITMO.respiroMs), null);
  });

  it("o intervalo conta do início da pergunta", () => {
    const e = { ultimaPerguntaEm: AGORA - 10_000, ultimaRespostaEm: AGORA - 5 * MIN };
    assert.equal(motivo(e, AGORA), "INTERVALO_ENTRE_PERGUNTAS");
    assert.equal(motivo(e, AGORA - 10_000 + INTERVALO), null);
  });

  it("estado antigo sem ultimaRespostaEm continua funcionando", () => {
    const antigo = estadoEm("APROFUNDAMENTO", { ...base, ultimaPerguntaEm: AGORA - 10_000 });
    delete (antigo as { ultimaRespostaEm?: number | null }).ultimaRespostaEm;
    assert.equal(motivoBloqueioPlin(antigo, AGORA), "INTERVALO_ENTRE_PERGUNTAS");
    assert.equal(motivoBloqueioPlin(antigo, AGORA - 10_000 + INTERVALO), null);
  });
});
