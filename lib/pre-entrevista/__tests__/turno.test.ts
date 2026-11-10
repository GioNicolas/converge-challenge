// O turno obedece ao movimento que o modelo declarou: repetir e esclarecer não mudam o plano, e só uma fala que
// executa o passo o fecha. LLM e Jev falsos.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Classificacao } from "../classificador";
import { conduzirTurno } from "../turno";
import { CLASSIFICACAO, chatFalso, jevFalso, saida, sessaoAberta, type LeituraFalsa } from "./apoio";

const PERGUNTA = "Se o tempo acabar, o que conta mais: uma solução funcionando ou o caminho bem explicado?";
const CONTEXTO = "Tem alguma coisa que reprova direto pra vocês?";
const RESUMO = "Vai ser live coding pra nível pleno. Vou olhar como ele escreve e explica o código.";

/** Conduz uma conversa com as falas dela, as leituras do Jev e as respostas do modelo, uma por turno. */
async function conversar(turnos: Array<{ ela: string; jev?: LeituraFalsa; totti: string }>, classificacao: Classificacao = CLASSIFICACAO) {
  const sessao = sessaoAberta([], classificacao);
  const falso = chatFalso(...turnos.map((t) => t.totti));
  const deps = { chat: falso.chat, ...jevFalso(...turnos.map((t) => t.jev ?? {})) };
  const resultados = [];
  for (const turno of turnos) resultados.push(await conduzirTurno(sessao, turno.ela, deps));
  return { sessao, resultados, deps, falso };
}

/** Ela confirma o início e o Totti faz a pergunta de aprofundamento. */
const ATE_APROFUNDAR = [{ ela: "isso, pode seguir", jev: { cobertura: { confirmou_inicio: 1 } }, totti: saida(PERGUNTA) }];
/** Depois, ela responde, diz o eliminatório e o Totti faz o resumo. */
const ATE_O_RESUMO = [
  ...ATE_APROFUNDAR,
  { ela: "a solução funcionando, e reprova quem copia sem entender", jev: { cobertura: { criterio_tecnico: 1, eliminatorios: 1 } }, totti: saida(RESUMO) },
];

describe("conduzirTurno: sem movimento, nada muda", () => {
  it("a fala executa o passo e ele conta como feito", async () => {
    const { sessao, resultados } = await conversar(ATE_APROFUNDAR);
    assert.deepEqual(resultados[0].passo, { tipo: "aprofundar", area: "tecnico", motivo: "inicial" });
    assert.equal(resultados[0].movimento, "seguir");
    assert.equal(sessao.plano.perguntasPorTopico.criterio_tecnico, 1);
    assert.equal(sessao.plano.ultimoPasso?.tipo, "aprofundar");
  });

  it("o resumo conta, e o texto dele fica guardado para repetir", async () => {
    const { sessao, resultados } = await conversar(ATE_O_RESUMO);
    assert.equal(resultados[1].passo.tipo, "resumo_final");
    assert.equal(sessao.plano.resumos, 1);
    assert.equal(sessao.resumo?.texto, resultados[1].fala);
    assert.match(resultados[1].fala, /posso finalizar\?$/);
  });
});

describe("conduzirTurno: repetir e esclarecer não mudam o plano", () => {
  it("depois de aprofundar, repetir deixa tudo como estava, e a resposta de verdade segue do mesmo ponto", async () => {
    const antes = await conversar(ATE_APROFUNDAR);
    const { sessao, resultados } = await conversar([
      ...ATE_APROFUNDAR,
      // O Jev lê o pedido de repetição como se fosse uma resposta: marca a área e uma dispensa.
      { ela: "desculpa, pode repetir a pergunta", jev: { sinais: { dispensa_tecnico: 1, quer_pressao: 1 }, niveis: { pressao: "central" } }, totti: saida(PERGUNTA, "repetir") },
    ]);
    assert.equal(resultados[1].movimento, "repetir");
    assert.equal(resultados[1].fala, PERGUNTA);
    assert.deepEqual(sessao.plano, antes.sessao.plano);
    assert.deepEqual(sessao.rascunho.focus, antes.sessao.rascunho.focus);
    assert.deepEqual(sessao.enfaseEstado, antes.sessao.enfaseEstado);
    assert.deepEqual(sessao.preferencias, antes.sessao.preferencias);
    // As duas falas entram na transcrição, e o movimento vai para o log da fala.
    assert.deepEqual(
      sessao.transcricao.slice(-2).map((t) => t.text),
      ["desculpa, pode repetir a pergunta", PERGUNTA],
    );
    const falaNoLog = sessao.logs.filter((e) => e.tipo === "fala_agente").at(-1);
    assert.equal((falaNoLog?.dados as { movimento: string }).movimento, "repetir");
    const mantido = sessao.logs.filter((e) => e.tipo === "plano").at(-1);
    assert.match(mantido?.resumo ?? "", /^passo mantido \(movimento repetir\): aprofundar tecnico/);

    // Turno seguinte, com a resposta de verdade: a conversa segue do mesmo ponto (a pergunta de contexto vem agora).
    const jev = jevFalso({ cobertura: { criterio_tecnico: 1 } });
    const seguinte = await conduzirTurno(sessao, "a solução funcionando", { chat: chatFalso(saida(CONTEXTO)).chat, ...jev });
    assert.equal(seguinte.passo.tipo, "perguntar_contexto");
    assert.deepEqual(sessao.plano.perguntasPorTopico, { confirmou_inicio: 1, criterio_tecnico: 1, contexto: 1 });
  });

  it("'quarenta e cinco minutos' dito dentro de um pedido de repetição não vira duração", async () => {
    const { sessao } = await conversar([
      ...ATE_APROFUNDAR,
      { ela: "pode repetir? não ouvi nada depois dos quarenta e cinco minutos de reunião", totti: saida(PERGUNTA, "repetir") },
    ]);
    assert.equal(sessao.preferencias.duracaoMin, undefined);
  });

  it("a mesma fala, sem movimento, é lida como resposta: a duração entra", async () => {
    const { sessao } = await conversar([
      ...ATE_APROFUNDAR,
      { ela: "quero quarenta e cinco minutos de entrevista", jev: { cobertura: { criterio_tecnico: 1 } }, totti: saida(CONTEXTO) },
    ]);
    assert.equal(sessao.preferencias.duracaoMin, 45);
  });

  it("depois de uma oferta de troca, esclarecer não registra decisão", async () => {
    // IA aplicada pesa mais e live coding não a mede: a abertura já oferece a troca para system design.
    const comIa: Classificacao = {
      ...CLASSIFICACAO,
      focus: [
        { area: "uso_ia", weight: 0.6 },
        { area: "tecnico", weight: 0.4 },
      ],
    };
    const opcoes = "São três caminhos: trocar pra system design, deixar IA aplicada pra próxima etapa ou seguir sem. O que prefere?";
    const { sessao, resultados } = await conversar([{ ela: "não entendi, quais eram as opções mesmo", totti: saida(opcoes, "esclarecer") }], comIa);
    assert.equal(sessao.plano.tradeoffNaAbertura, true);
    assert.equal(resultados[0].movimento, "esclarecer");
    assert.deepEqual(sessao.plano.decisoesTradeoff, {});
    assert.equal(sessao.plano.ultimoPasso?.tipo, "oferecer_tradeoff");
  });

  it("depois do resumo, três repetições seguidas não encerram e resumos continua 1", async () => {
    const pedido = { ela: "pode repetir o resumo", totti: saida("Claro. Vai ser live coding pra nível pleno.", "repetir") };
    const { sessao, resultados } = await conversar([...ATE_O_RESUMO, pedido, pedido, pedido]);
    const resumoFalado = resultados[1].fala;
    for (const r of resultados.slice(2)) {
      assert.equal(r.movimento, "repetir");
      assert.notEqual(r.passo.tipo, "encerrar");
      // Sai o último resumo como foi falado, sem montar outro.
      assert.equal(r.fala, resumoFalado);
    }
    assert.equal(sessao.plano.resumos, 1);
    assert.deepEqual(sessao.plano.ultimoPasso, { tipo: "resumo_final" });
    assert.equal(sessao.resumo?.texto, resumoFalado);
  });
});

describe("conduzirTurno: responder mantém o que foi lido e não conta o passo", () => {
  it("ela responde e pergunta na mesma fala: a resposta fica, o passo escolhido não é contado", async () => {
    const resposta = "Não vê, a conversa fica só com vocês. Tem alguma coisa que reprova direto?";
    const { sessao, resultados } = await conversar([
      ...ATE_APROFUNDAR,
      {
        ela: "a solução funcionando, em quarenta e cinco minutos. aliás, o candidato vê essa conversa?",
        jev: { cobertura: { criterio_tecnico: 1 } },
        totti: saida(resposta, "responder"),
      },
    ]);
    assert.equal(resultados[1].movimento, "responder");
    assert.equal(resultados[1].fala, resposta);
    // O que foi lido da fala dela fica.
    assert.equal(sessao.preferencias.duracaoMin, 45);
    assert.equal(sessao.rascunho.cobertura.criterio_tecnico, 1);
    // O passo que o planejador tinha escolhido (a pergunta de contexto) não conta como feito.
    assert.equal(resultados[1].passo.tipo, "perguntar_contexto");
    assert.equal(sessao.plano.perguntasPorTopico.contexto, undefined);
    assert.equal(sessao.plano.ultimoPasso?.tipo, "aprofundar");
  });

  it("depois do resumo, pedido de tempo não gera resumo de revisão nem conta outro resumo", async () => {
    const { sessao, resultados } = await conversar([...ATE_O_RESUMO, { ela: "peraí, deixa eu ler aqui na tela", totti: saida("Claro, sem pressa.", "responder") }]);
    assert.equal(resultados[2].fala, "Claro, sem pressa.");
    assert.equal(sessao.plano.resumos, 1);
    assert.deepEqual(sessao.plano.ultimoPasso, { tipo: "resumo_final" });
  });
});

describe("conduzirTurno: fala fixa só com aprovação ou pedido claro", () => {
  it("aprovação clara depois do resumo encerra com a fala fixa, sem chamar o modelo", async () => {
    const { resultados, falso } = await conversar([...ATE_O_RESUMO, { ela: "pode finalizar", jev: { sinais: { aprovou_resumo: 1 } }, totti: saida("não devia ser usada") }]);
    assert.equal(resultados[2].passo.tipo, "encerrar");
    assert.equal(falso.chamadas.length, 2);
  });

  it("pedido claro de mudança de duração sai com a confirmação fixa", async () => {
    const { resultados, falso } = await conversar([
      ...ATE_O_RESUMO,
      { ela: "muda pra quarenta e cinco minutos", jev: { sinais: { pediu_mudanca: 1 } }, totti: saida("não devia ser usada") },
    ]);
    assert.equal(resultados[2].fala, "Ajustei quarenta e cinco minutos. Posso finalizar?");
    assert.equal(falso.chamadas.length, 2);
  });

  it("sem aprovação nem pedido claro, a fala vai ao modelo com o resumo em curso", async () => {
    const resposta = "Ficou em quarenta e cinco minutos. Posso finalizar?";
    const { sessao, resultados, falso } = await conversar([
      ...ATE_O_RESUMO,
      { ela: "acho que sim… quarenta e cinco minutos, né?", totti: saida(resposta, "responder") },
    ]);
    assert.equal(resultados[2].fala, resposta);
    assert.equal(falso.chamadas.length, 3);
    assert.match(falso.chamadas[2][1].content, /não aprovou nem pediu uma mudança clara/);
    assert.equal(sessao.plano.resumos, 1);
  });
});
