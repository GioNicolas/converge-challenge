// O fechamento comum do Totti guardado na sessão do quadro (#84): o estado é só dados, a sessão volta à fase em que
// estava quando ele retoma o desenho de verdade, e a análise deixa de levantar pergunta enquanto ele dura.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { iniciarFechamento, proximoPasso, type EstadoFechamento } from "../../../totti/fechamento";
import { estadoInicial, tempoRestanteMs, transicionar, type EstadoSessao } from "../estado";
import { caminhoPrincipalDesenhado, pecasDoGrafo, voltouADesenhar } from "../fechamento";
import { motivoBloqueioPlin } from "../politica";

const AGORA = 1_800_000_000_000;
const MIN = 60_000;
const GRAFO = ["COMPONENTES", "- [r1] Cliente (retângulo)", "- [r2] API (retângulo)", "- [r3] Banco (retângulo)", "CONEXÕES", "- [s1] Cliente → API", "- [s2] API → Banco"].join("\n");
const COM_UMA_NOVA = `${GRAFO}\n- [s3] Cliente → Banco`;
const COM_DUAS_NOVAS = GRAFO.replace("CONEXÕES", "- [r4] Fila (retângulo)\nCONEXÕES") + "\n- [s3] API → Fila";
const MOVIDO = GRAFO.replace("- [r2] API (retângulo)", "- [r2] Servidor de API (retângulo)");

function estadoEm(fase: EstadoSessao["fase"], extra: Partial<EstadoSessao> = {}): EstadoSessao {
  return { ...estadoInicial(), fase, faseIniciadaEm: AGORA - 5 * MIN, iniciadaEm: AGORA - 12 * MIN, ...extra };
}
/** O fechamento do núcleo já no primeiro passo (anúncio dito, primeira pergunta final em aberto). */
function nucleoIniciado(perguntas = ["Como você garante a ordem dentro de uma conversa?", "Como fica um grupo de 256 pessoas?"]): EstadoFechamento {
  const inicial = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: perguntas.map((pergunta) => ({ pergunta })) });
  return proximoPasso(inicial, undefined, "").estado;
}
function emFechamento(de: EstadoSessao = estadoEm("ALTO_NIVEL")): EstadoSessao {
  const concluiu = transicionar(de, { tipo: "CANDIDATO_CONCLUIU", grafo: GRAFO }, AGORA).estado;
  return transicionar(concluiu, { tipo: "FECHAMENTO_ATUALIZADO", inicio: true, nucleo: nucleoIniciado(), antes: null, grafo: GRAFO }, AGORA).estado;
}

describe("o desenho: caminho principal e volta a desenhar", () => {
  it("caminho principal: três componentes ligados por duas conexões (seta solta não liga nada)", () => {
    assert.equal(caminhoPrincipalDesenhado(GRAFO), true);
    assert.equal(caminhoPrincipalDesenhado("COMPONENTES\n- [r1] Cliente (retângulo)\n- [r2] API (retângulo)\nCONEXÕES\n- [s1] Cliente → API"), false);
    assert.equal(caminhoPrincipalDesenhado(GRAFO.replace("- [s2] API → Banco", "- [s2] API → ? (seta solta)")), false);
    assert.equal(caminhoPrincipalDesenhado(undefined), false);
    assert.equal(caminhoPrincipalDesenhado(""), false);
  });

  it("as peças são os componentes e as conexões; anotação solta não é peça", () => {
    assert.deepEqual(pecasDoGrafo(`${GRAFO}\nANOTAÇÕES SOLTAS\n- [t1] "cache?"`), ["r1", "r2", "r3", "s1", "s2"]);
    assert.equal(pecasDoGrafo(undefined), null);
    assert.equal(pecasDoGrafo("x".repeat(24_000)), null, "grafo que pode ter vindo cortado não serve de base");
  });

  it("voltar a desenhar é pôr peças novas: mover, renomear ou mandar o mesmo desenho de novo não conta", () => {
    const concluido = { em: AGORA, pecas: pecasDoGrafo(GRAFO) };
    assert.equal(voltouADesenhar(concluido, GRAFO), false, "o mesmo desenho (evento repetido)");
    assert.equal(voltouADesenhar(concluido, MOVIDO), false, "peça renomeada");
    assert.equal(voltouADesenhar(concluido, "COMPONENTES\n- [r1] Cliente (retângulo)\nCONEXÕES"), false, "peças apagadas");
    assert.equal(voltouADesenhar(concluido, COM_UMA_NOVA), false, "um ajuste solto enquanto responde");
    assert.equal(voltouADesenhar(concluido, COM_DUAS_NOVAS), true);
    assert.equal(voltouADesenhar({ em: AGORA, pecas: null }, COM_DUAS_NOVAS), false, "sem base não há como comparar");
    assert.equal(voltouADesenhar(null, COM_DUAS_NOVAS), false);
  });
});

describe("fechamento na sessão do quadro", () => {
  it("começar leva a sessão a FECHAMENTO, guarda a fase de antes e solta a pergunta que esperava a vez", () => {
    const pendente: EstadoSessao["perguntaPendente"] = {
      status: "duvida", parteFechada: true, pergunta: "Por que o cliente fala direto com o banco?", nota: "Direto no banco?", elementos: ["s3"], degrau: null, observacoes: [], criadoEm: AGORA - 5_000,
    };
    const antes = estadoEm("ALTO_NIVEL", { plin: "PLIN_PENDENTE", perguntaPendente: pendente });
    const r = transicionar(antes, { tipo: "FECHAMENTO_ATUALIZADO", inicio: true, nucleo: nucleoIniciado(), antes: null, grafo: GRAFO }, AGORA);
    assert.equal(r.estado.fase, "FECHAMENTO");
    assert.equal(r.estado.faseIniciadaEm, AGORA);
    assert.equal(r.estado.fechamento?.faseAnterior, "ALTO_NIVEL");
    assert.equal(r.estado.fechamento?.faseAnteriorIniciadaEm, AGORA - 5 * MIN);
    assert.equal(r.estado.fechamento?.nucleo.etapa, "perguntas_finais");
    assert.equal(r.estado.plin, "LIVRE");
    assert.equal(r.estado.perguntaPendente, null);
    assert.deepEqual(r.estado.desenhoConcluido?.pecas, ["r1", "r2", "r3", "s1", "s2"]);
    assert.ok(r.efeitos.some((e) => e.tipo === "FASE_MUDOU" && e.para === "FECHAMENTO"));
  });

  it("é só dados: sobrevive a ir ao banco e voltar, e estado antigo (sem os campos) segue funcionando", () => {
    const e = emFechamento();
    assert.deepEqual(JSON.parse(JSON.stringify(e)), e);
    const antigo = estadoEm("APROFUNDAMENTO");
    delete (antigo as Partial<EstadoSessao>).fechamento;
    delete (antigo as Partial<EstadoSessao>).desenhoConcluido;
    assert.equal(motivoBloqueioPlin(antigo, AGORA, undefined, { paradoHaS: 60 }) === "FECHAMENTO", false);
    assert.equal(transicionar(antigo, { tipo: "DESENHO_ATUALIZADO", grafo: COM_DUAS_NOVAS }, AGORA).estado, antigo);
    assert.equal(transicionar(antigo, { tipo: "FECHAMENTO_DESFEITO" }, AGORA).estado, antigo);
    assert.equal(transicionar(antigo, { tipo: "CANDIDATO_CONCLUIU" }, AGORA).estado.conclusoes, 1);
  });

  it("a análise segue colhendo observações, mas não levanta pergunta durante o fechamento", () => {
    const e = emFechamento();
    assert.equal(motivoBloqueioPlin(e, AGORA + 30_000, undefined, { paradoHaS: 60 }), "FECHAMENTO");
    const comAnalise = transicionar(e, { tipo: "ANALISE_RECEBIDA", resposta: {
      status: "ok", parteFechada: false, pergunta: null, nota: null, elementos: [], degrau: null,
      observacoes: [{ criterio: "escalabilidade", sinal: "positivo", espontaneo: true, evidencia: "Disse que escalaria os servidores de conexão." }],
    } }, AGORA + 30_000).estado;
    assert.equal(comAnalise.observacoes.length, 1);
    assert.equal(comAnalise.fechamento?.nucleo.etapa, "perguntas_finais");
  });

  it("um passo sem o fechamento no estado (ele foi suspenso no meio do pedido) não o traz de volta", () => {
    const livre = estadoEm("ALTO_NIVEL");
    const r = transicionar(livre, { tipo: "FECHAMENTO_ATUALIZADO", inicio: false, nucleo: nucleoIniciado(), antes: nucleoIniciado() }, AGORA);
    assert.equal(r.estado, livre);
  });

  it("ele volta a desenhar: o fechamento é suspenso e a entrevista retoma a fase em que estava", () => {
    const e = emFechamento();
    for (const [grafo, nome] of [[GRAFO, "o mesmo desenho"], [MOVIDO, "peça renomeada"], [COM_UMA_NOVA, "uma peça solta"]] as const) {
      assert.equal(transicionar(e, { tipo: "DESENHO_ATUALIZADO", grafo }, AGORA + 20_000).estado, e, nome);
    }
    const r = transicionar(e, { tipo: "DESENHO_ATUALIZADO", grafo: COM_DUAS_NOVAS }, AGORA + 20_000);
    assert.equal(r.estado.fechamento, null);
    assert.equal(r.estado.fase, "ALTO_NIVEL");
    assert.equal(r.estado.faseIniciadaEm, AGORA - 5 * MIN);
    assert.equal(r.estado.desenhoConcluido, null);
    assert.equal(r.estado.perguntaFinalFeita, false);
    assert.deepEqual(r.efeitos, [{ tipo: "FECHAMENTO_SUSPENSO" }]);
    assert.equal(motivoBloqueioPlin(r.estado, AGORA + 20_000, undefined, { paradoHaS: 60 }) === "FECHAMENTO", false, "a análise volta a poder perguntar");
  });

  it("depois de suspenso, o FECHAMENTO que o quadro ainda manda é a fase velha; a fase nova dele volta a valer", () => {
    const suspenso = transicionar(emFechamento(), { tipo: "DESENHO_ATUALIZADO", grafo: COM_DUAS_NOVAS }, AGORA + 20_000).estado;
    const velha = transicionar(suspenso, { tipo: "SINCRONIZAR_FASE", fase: "FECHAMENTO" }, AGORA + 21_000).estado;
    assert.equal(velha.fase, "ALTO_NIVEL");
    const ciente = transicionar(velha, { tipo: "SINCRONIZAR_FASE", fase: "ALTO_NIVEL" }, AGORA + 22_000).estado;
    assert.equal(ciente.fase, "ALTO_NIVEL");
    assert.equal(transicionar(ciente, { tipo: "SINCRONIZAR_FASE", fase: "FECHAMENTO" }, AGORA + 9 * MIN).estado.fase, "FECHAMENTO", "o relógio do quadro chegou lá");
    assert.equal(transicionar(suspenso, { tipo: "SINCRONIZAR_FASE", fase: "ENCERRADA" }, AGORA + 23_000).estado.fase, "ENCERRADA");
  });

  it("na despedida já não há volta: desenho novo não desfaz o encerramento", () => {
    const naDespedida = iniciarFechamento({ sala: "quadro", gatilho: "pediu_encerrar" });
    const passo = proximoPasso(naDespedida, undefined, "");
    assert.equal(passo.encerrar, true);
    const e = transicionar(estadoEm("APROFUNDAMENTO"), { tipo: "FECHAMENTO_ATUALIZADO", inicio: true, nucleo: passo.estado, antes: null, grafo: GRAFO }, AGORA).estado;
    assert.equal(transicionar(e, { tipo: "DESENHO_ATUALIZADO", grafo: COM_DUAS_NOVAS }, AGORA + 5_000).estado, e);
  });

  it("a fala que começou o fechamento foi substituída: ele é desfeito e a conclusão não conta duas vezes", () => {
    const e = emFechamento();
    assert.equal(e.conclusoes, 1);
    const r = transicionar(e, { tipo: "FECHAMENTO_DESFEITO" }, AGORA + 2_000).estado;
    assert.equal(r.fechamento, null);
    assert.equal(r.fase, "ALTO_NIVEL");
    assert.equal(r.conclusoes, 0);
  });

  it("\"terminei\" em REQUISITOS não marca o desenho como concluído", () => {
    assert.equal(transicionar(estadoEm("REQUISITOS"), { tipo: "CANDIDATO_CONCLUIU", grafo: GRAFO }, AGORA).estado.desenhoConcluido, undefined);
    assert.deepEqual(transicionar(estadoEm("ALTO_NIVEL"), { tipo: "CANDIDATO_CONCLUIU", grafo: GRAFO }, AGORA).estado.desenhoConcluido, { em: AGORA, pecas: ["r1", "r2", "r3", "s1", "s2"] });
  });
});

describe("tempo que resta da entrevista", () => {
  it("conta do começo da entrevista, em milissegundos, e não fica negativo", () => {
    const e = estadoEm("ALTO_NIVEL", { tempos: { APRESENTACAO: 60, REQUISITOS: 240, ALTO_NIVEL: 600, APROFUNDAMENTO: 600, FECHAMENTO: 300 } });
    assert.equal(tempoRestanteMs(e, AGORA), 30 * MIN - 12 * MIN);
    assert.equal(tempoRestanteMs(e, AGORA + 40 * MIN), 0);
  });

  it("com plano da vaga vale a duração do plano", () => {
    const e = estadoEm("ALTO_NIVEL", { plano: { duracaoMin: 20 } as EstadoSessao["plano"] });
    assert.equal(tempoRestanteMs(e, AGORA), 8 * MIN);
  });
});
