// O turno obedece ao movimento que o modelo declarou: repetir e esclarecer não mudam o plano, e só uma fala que
// executa o passo o fecha. LLM e Jev falsos.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Classificacao } from "../classificador";
import { conduzirTurno, desfazerValor } from "../turno";
import { ErroChat } from "../llm";
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

  it("o que a extração gravou enquanto o Totti respondia sobrevive ao desfazer do repetir", async () => {
    const { sessao } = await conversar(ATE_APROFUNDAR);
    const falso = chatFalso(saida(PERGUNTA, "repetir"));
    // A extração do turno anterior grava no rascunho durante a espera do modelo.
    const chat: typeof falso.chat = async (op) => {
      sessao.rascunho = { ...sessao.rascunho, eliminatorios: ["copiar sem entender"] } as typeof sessao.rascunho;
      return falso.chat(op);
    };
    const antesPlano = structuredClone(sessao.plano);
    await conduzirTurno(sessao, "desculpa, pode repetir a pergunta", {
      chat,
      ...jevFalso({ sinais: { dispensa_tecnico: 1 } }),
    });
    assert.deepEqual((sessao.rascunho as { eliminatorios?: unknown }).eliminatorios, ["copiar sem entender"]);
    assert.deepEqual(sessao.plano, antesPlano);
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

describe("conduzirTurno: resposta que não é escolha nem aprovação vai ao modelo", () => {
  /** IA aplicada pesa mais e live coding não a mede: a abertura já oferece a troca para system design. */
  const COM_IA: Classificacao = {
    ...CLASSIFICACAO,
    focus: [
      { area: "uso_ia", weight: 0.6 },
      { area: "tecnico", weight: 0.4 },
    ],
  };
  /** A vaga não diz o nível: a abertura pergunta. */
  const SEM_NIVEL: Classificacao = { ...CLASSIFICACAO, nivelExplicito: 0.2, confirmar: ["seniority"] };
  /** A saída do modelo com o campo `decisao`. */
  const comDecisao = (fala: string, decisao: string, movimento = "responder") => JSON.stringify({ fala, movimento, decisao });

  it("troca: 'hum, deixa eu pensar' espera, e a oferta continua aberta", async () => {
    const { sessao, resultados, falso } = await conversar([{ ela: "hum, deixa eu pensar", totti: comDecisao("Claro, sem pressa.", "adiar") }], COM_IA);
    assert.equal(resultados[0].fala, "Claro, sem pressa.");
    assert.deepEqual(sessao.plano.decisoesTradeoff, {});
    assert.equal(sessao.plano.ultimoPasso?.tipo, "oferecer_tradeoff");
    assert.equal(sessao.plano.perguntasPorTopico.tradeoff_uso_ia, 1);
    assert.match(falso.chamadas[0][1].content, /DECISÃO PENDENTE: troca de formato/);
    assert.doesNotMatch(falso.chamadas[0][1].content, /PASSO DESTA FALA/);
  });

  it("troca: 'tanto faz, o que você recomenda?' recomenda e mantém a oferta aberta", async () => {
    const recomendacao = "Se construir com IA é o centro da vaga, eu trocaria pra system design. Qual você prefere?";
    const { sessao, resultados } = await conversar([{ ela: "tanto faz, o que você recomenda?", totti: comDecisao(recomendacao, "adiar") }], COM_IA);
    assert.equal(resultados[0].fala, recomendacao);
    assert.deepEqual(sessao.plano.decisoesTradeoff, {});
  });

  it("troca: escolha com outras palavras é aplicada, e a fala é a do passo seguinte", async () => {
    const { sessao, resultados, falso } = await conversar(
      [{ ela: "a primeira opção que você falou", totti: comDecisao("Fechado, a primeira.", "trocar") }, { ela: "-", totti: saida(PERGUNTA) }],
      COM_IA,
    );
    assert.equal(sessao.plano.decisoesTradeoff.uso_ia, "trocou");
    assert.equal(sessao.rascunho.mode, "system_design");
    // Duas chamadas no primeiro turno: a que leu a decisão e a do passo seguinte, já sem decisão pendente.
    assert.match(falso.chamadas[0][1].content, /DECISÃO PENDENTE: troca de formato/);
    assert.match(falso.chamadas[1][1].content, /PASSO DESTA FALA/);
    assert.equal(resultados[0].fala, PERGUNTA);
    assert.equal(resultados[0].movimento, "seguir");
  });

  it("troca: escolha clara pelos sinais não passa pelo caminho novo", async () => {
    const { sessao, falso } = await conversar([{ ela: "deixa pra próxima etapa", jev: { sinais: { escolheu_proxima_etapa: 1 } }, totti: saida(PERGUNTA) }], COM_IA);
    assert.equal(sessao.plano.decisoesTradeoff.uso_ia, "proxima_etapa");
    assert.equal(falso.chamadas.length, 1);
    assert.doesNotMatch(falso.chamadas[0][1].content, /DECISÃO PENDENTE/);
  });

  it("troca: decisão que não existe ou campo ausente não decide nada", async () => {
    const invalida = await conversar([{ ela: "sei lá", totti: comDecisao("Quer trocar, deixar pra próxima etapa ou seguir sem?", "talvez") }], COM_IA);
    assert.deepEqual(invalida.sessao.plano.decisoesTradeoff, {});
    const ausente = await conversar([{ ela: "sei lá", totti: saida("Quer trocar, deixar pra próxima etapa ou seguir sem?") }], COM_IA);
    assert.deepEqual(ausente.sessao.plano.decisoesTradeoff, {});
    assert.equal(ausente.resultados[0].movimento, "responder");
    assert.equal(ausente.sessao.plano.perguntasPorTopico.tradeoff_uso_ia, 1);
  });

  it("troca: valor com maiúscula, espaço ou acento ainda vale", async () => {
    const { sessao } = await conversar(
      [{ ela: "a primeira", totti: comDecisao("Fechado.", " Próxima Etapa ") }, { ela: "-", totti: saida(PERGUNTA) }],
      COM_IA,
    );
    assert.equal(sessao.plano.decisoesTradeoff.uso_ia, "proxima_etapa");
  });

  it("troca: depois de dois adiamentos segue para a próxima etapa, dizendo isso", async () => {
    const adiar = comDecisao("Quer trocar, deixar pra próxima etapa ou seguir sem?", "adiar");
    const { sessao, resultados } = await conversar(
      [
        { ela: "hmm", totti: adiar },
        { ela: "sei lá", totti: adiar },
        { ela: "-", totti: saida(PERGUNTA) },
      ],
      COM_IA,
    );
    assert.equal(resultados[0].movimento, "responder");
    assert.equal(sessao.plano.decisoesTradeoff.uso_ia, "proxima_etapa");
    assert.match(resultados[1].fala, /^Como não fechamos isso, deixo pra próxima etapa do processo\./);
  });

  it("troca: falha do modelo não decide nada e sai a fala de reserva", async () => {
    const sessao = sessaoAberta([], COM_IA);
    const chat = async () => {
      throw new ErroChat("nenhum provedor respondeu", []);
    };
    const r = await conduzirTurno(sessao, "hum", { chat, ...jevFalso() });
    assert.equal(r.fala, "Não peguei qual caminho você prefere: trocar pra system design, deixar pra próxima etapa ou seguir sem?");
    assert.deepEqual(sessao.plano.decisoesTradeoff, {});
    // A fala dela fica na transcrição: nada a reenviar.
    assert.equal(sessao.transcricao.at(-2)?.text, "hum");
  });

  it("sem decisão pendente, a falha do modelo continua desfazendo a fala e subindo o erro", async () => {
    const sessao = sessaoAberta();
    const chat = async () => {
      throw new ErroChat("nenhum provedor respondeu", []);
    };
    await assert.rejects(conduzirTurno(sessao, "isso", { chat, ...jevFalso({ cobertura: { confirmou_inicio: 1 } }) }), ErroChat);
    assert.equal(sessao.transcricao.length, 1);
  });

  it("nível: 'não sei' segue com a estimativa, dito em voz alta, sem perguntar de novo", async () => {
    const { sessao, resultados } = await conversar(
      [{ ela: "não sei, o gestor não me falou", totti: comDecisao("Tranquilo.", "estimativa") }, { ela: "-", totti: saida("É isso, ou quer focar em outra coisa?") }],
      SEM_NIVEL,
    );
    assert.match(resultados[0].fala, /^Sigo com nível pleno então; dá pra mudar na revisão\. /);
    assert.equal(sessao.plano.nivelPorEstimativa, true);
    assert.equal(sessao.plano.perguntasPorTopico.nivel, undefined);
    assert.equal(sessao.rascunho.seniority, "pleno");
  });

  it("nível: dito com outras palavras é registrado", async () => {
    const { sessao } = await conversar(
      [{ ela: "alguém já bem experiente", totti: comDecisao("Sênior, então.", "senior") }, { ela: "-", totti: saida("É isso, ou quer focar em outra coisa?") }],
      SEM_NIVEL,
    );
    assert.equal(sessao.rascunho.seniority, "senior");
    assert.equal(sessao.rascunho.confirmado.seniority, true);
  });

  it("nível: 'é pleno' continua resolvido pelos sinais, sem o caminho novo", async () => {
    const { sessao, falso } = await conversar([{ ela: "é pleno", jev: { nivelDito: "pleno" }, totti: saida("É isso, ou quer focar em outra coisa?") }], SEM_NIVEL);
    assert.equal(sessao.rascunho.confirmado.seniority, true);
    assert.doesNotMatch(falso.chamadas[0][1].content, /DECISÃO PENDENTE/);
  });

  it("resumo: 'peraí, deixa eu ler aqui na tela' espera, sem novo resumo", async () => {
    const { sessao, resultados, falso } = await conversar([...ATE_O_RESUMO, { ela: "peraí, deixa eu ler aqui na tela", totti: comDecisao("Claro, sem pressa.", "adiar") }]);
    assert.equal(resultados[2].fala, "Claro, sem pressa.");
    assert.equal(sessao.plano.resumos, 1);
    assert.match(falso.chamadas[2][1].content, /DECISÃO PENDENTE: aprovação do resumo/);
  });

  it("resumo: 'acho que sim… a duração ficou quanto mesmo?' responde a duração e pergunta de novo", async () => {
    const resposta = "Ficou em quarenta minutos. Posso finalizar?";
    const { sessao, resultados } = await conversar([...ATE_O_RESUMO, { ela: "acho que sim… a duração ficou quanto mesmo?", totti: comDecisao(resposta, "adiar") }]);
    assert.equal(resultados[2].fala, resposta);
    assert.notEqual(resultados[2].passo.tipo, "encerrar");
    assert.equal(sessao.plano.resumos, 1);
  });

  it("resumo: aprovação com outras palavras encerra com a fala fixa", async () => {
    const { resultados } = await conversar([...ATE_O_RESUMO, { ela: "manda bala", totti: comDecisao("Fechado.", "finalizar") }]);
    assert.equal(resultados[2].passo.tipo, "encerrar");
    assert.notEqual(resultados[2].fala, "Fechado.");
  });

  it("resumo: mudança lida pelo modelo conta como resumo de verdade", async () => {
    const { sessao, resultados } = await conversar([...ATE_O_RESUMO, { ela: "ah, e ele pode usar o Google", totti: comDecisao("Anotado: ele pode consultar o Google. Posso finalizar?", "mudar") }]);
    assert.deepEqual(resultados[2].passo, { tipo: "resumo_final", revisao: true });
    assert.equal(sessao.plano.resumos, 2);
  });

  it("resumo: muitas falas sem aprovação não encerram a conversa", async () => {
    const espera = { ela: "pera", totti: comDecisao("Sem pressa.", "adiar") };
    const { sessao, resultados } = await conversar([...ATE_O_RESUMO, espera, espera, espera, espera, espera]);
    assert.ok(resultados.every((r) => r.passo.tipo !== "encerrar"));
    assert.equal(sessao.plano.resumos, 1);
  });
});

describe("desfazerValor: desfaz a leitura sem pisar no que outro caminho gravou", () => {
  it("valor ainda igual ao de depois volta ao de antes", () => {
    assert.deepEqual(desfazerValor({ a: 1 }, { a: 0 }, { a: 1 }), { a: 0 });
  });

  it("lista que ganhou itens no fim mantém os novos e perde os da leitura", () => {
    assert.deepEqual(desfazerValor(["lido", "extraido"], [], ["lido"]), ["extraido"]);
    assert.deepEqual(desfazerValor(["velho", "lido", "extraido"], ["velho"], ["velho", "lido"]), ["velho", "extraido"]);
  });

  it("objeto aninhado: cada sub-chave decide sozinha, em qualquer profundidade", () => {
    const antes = { pesos: { a: 1, b: 1 } };
    const depois = { pesos: { a: 2, b: 1 } }; // a leitura mexeu em `a`
    const atual = { pesos: { a: 2, b: 5 } }; // a extração mexeu em `b`
    assert.deepEqual(desfazerValor(atual, antes, depois), { pesos: { a: 1, b: 5 } });
  });

  it("chave que a leitura criou some, e a que outro caminho criou fica", () => {
    assert.deepEqual(desfazerValor({ lida: 1, extraida: 2 }, {}, { lida: 1 }), { extraida: 2 });
  });

  it("escalar mudado por outro caminho fica", () => {
    assert.equal(desfazerValor("extraido", "antes", "lido"), "extraido");
  });
});
