// Desfazer a leitura de uma fala que não era resposta (repetir e esclarecer) sem apagar o que outra escrita gravou
// na sessão: a extração em segundo plano, que grava enquanto o turno espera o Jev ou o Totti. LLM e Jev falsos.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Classificacao } from "../classificador";
import { conduzirTurno, type DepsDoTurno } from "../turno";
import { aplicarPesosNaSessao, type Sessao } from "../sessoes";
import { CLASSIFICACAO, chatFalso, jevFalso, saida, sessaoAberta, type LeituraFalsa } from "./apoio";

const PERGUNTA = "Se o tempo acabar, o que conta mais: uma solução funcionando ou o caminho bem explicado?";
const ELIMINATORIO = "copiar sem entender";

/** Ela confirma o início e o Totti faz a pergunta de aprofundamento. */
const ATE_APROFUNDAR = [{ ela: "isso, pode seguir", jev: { cobertura: { confirmou_inicio: 1 } }, totti: saida(PERGUNTA) }];

/** Conduz as falas dela com o Jev e o LLM falsos, uma fala por turno, a partir de `ATE_APROFUNDAR`. */
async function conversar(turnos: Array<{ ela: string; jev?: LeituraFalsa; totti: string }>, classificacao: Classificacao = CLASSIFICACAO) {
  const sessao = sessaoAberta([], classificacao);
  const falso = chatFalso(...turnos.map((t) => t.totti));
  const jev = jevFalso(...turnos.map((t) => t.jev ?? {}));
  for (const turno of turnos) await conduzirTurno(sessao, turno.ela, { chat: falso.chat, ...jev });
  return sessao;
}

/** A extração grava um critério eliminatório na sessão, como `rodarRodada` faz: troca o rascunho e refaz os pesos. */
function extracaoGrava(sessao: Sessao): void {
  sessao.rascunho = { ...sessao.rascunho, eliminatorios: [ELIMINATORIO] };
  aplicarPesosNaSessao(sessao, "segundo plano");
}

describe("conduzirTurno: extração gravada durante a espera pelo Jev", () => {
  it("o que a extração gravou enquanto o Jev lia a fala sobrevive ao repetir, e a leitura é desfeita", async () => {
    const sessao = await conversar(ATE_APROFUNDAR);
    const antesSinais = structuredClone(sessao.plano.sinais);
    const jev = jevFalso({ sinais: { dispensa_tecnico: 1, quer_pressao: 1 } });
    const lerCobertura = jev.avaliarCobertura;
    const falso = chatFalso(saida(PERGUNTA, "repetir"));
    const deps: DepsDoTurno = {
      chat: falso.chat,
      ...jev,
      // A extração grava antes de a leitura chegar: o que ela gravou é do estado de antes da leitura.
      avaliarCobertura: async (...args) => {
        extracaoGrava(sessao);
        return lerCobertura!(...args);
      },
    };
    await conduzirTurno(sessao, "desculpa, pode repetir a pergunta", deps);
    assert.deepEqual(sessao.rascunho.eliminatorios, [ELIMINATORIO]);
    assert.deepEqual(sessao.plano.sinais, antesSinais);
  });
});

describe("conduzirTurno: notas depois de desfazer a leitura", () => {
  it("a leitura 'sem dicas' de um pedido de esclarecimento não deixa nota contraditória, e o eliminatório da extração fica", async () => {
    const sessao = await conversar(ATE_APROFUNDAR);
    const jev = jevFalso({ sinais: { quer_sem_dicas: 1 } });
    const falso = chatFalso(saida(PERGUNTA, "esclarecer"));
    const deps: DepsDoTurno = {
      ...jev,
      // A extração grava durante a resposta do Totti, depois de a leitura já ter entrado no rascunho e nas notas.
      chat: async (op) => {
        extracaoGrava(sessao);
        return falso.chat(op);
      },
    };
    await conduzirTurno(sessao, "como assim sem dar dicas? não entendi a pergunta", deps);
    assert.equal(sessao.preferencias.dicas, "leves");
    assert.doesNotMatch(sessao.rascunho.recruiterNotes, /sem dicas/);
    assert.match(sessao.rascunho.recruiterNotes, /dica leve se travar/);
    assert.deepEqual(sessao.rascunho.eliminatorios, [ELIMINATORIO]);
  });
});

describe("conduzirTurno: sem extração concorrente, repetir volta ao estado de antes", () => {
  it("plano, rascunho, preferências, ênfase e pesos ficam iguais aos de antes da fala", async () => {
    const sessao = await conversar(ATE_APROFUNDAR);
    const antes = structuredClone({
      plano: sessao.plano,
      rascunho: sessao.rascunho,
      preferencias: sessao.preferencias,
      enfaseEstado: sessao.enfaseEstado,
      pesosDetalhe: sessao.pesosDetalhe,
    });
    const falso = chatFalso(saida(PERGUNTA, "repetir"));
    await conduzirTurno(sessao, "desculpa, pode repetir a pergunta", {
      chat: falso.chat,
      ...jevFalso({ sinais: { dispensa_tecnico: 1, quer_pressao: 1 }, niveis: { pressao: "central" } }),
    });
    assert.deepEqual(sessao.plano, antes.plano);
    assert.deepEqual(sessao.rascunho, antes.rascunho);
    assert.deepEqual(sessao.preferencias, antes.preferencias);
    assert.deepEqual(sessao.enfaseEstado, antes.enfaseEstado);
    assert.deepEqual(sessao.pesosDetalhe, antes.pesosDetalhe);
  });
});

describe("conduzirTurno: o Jev falha e a leitura é desfeita", () => {
  it("a duração lida na fala não fica em preferencias quando o Jev falha e o Totti repete", async () => {
    const sessao = await conversar(ATE_APROFUNDAR);
    const falso = chatFalso(saida(PERGUNTA, "repetir"));
    const deps: DepsDoTurno = {
      chat: falso.chat,
      avaliarCobertura: async () => {
        throw new Error("jev fora do ar");
      },
    };
    await conduzirTurno(sessao, "quero quarenta e cinco minutos de entrevista", deps);
    assert.equal(sessao.preferencias.duracaoMin, undefined);
  });

  it("a troca de formato pedida na fala não fica quando o Jev falha e o Totti repete", async () => {
    const sessao = await conversar(ATE_APROFUNDAR);
    const antesPlano = structuredClone(sessao.plano);
    const antesModo = sessao.rascunho.mode;
    const falso = chatFalso(saida(PERGUNTA, "repetir"));
    const deps: DepsDoTurno = {
      chat: falso.chat,
      avaliarCobertura: async () => {
        throw new Error("jev fora do ar");
      },
    };
    await conduzirTurno(sessao, "vamos de quadro", deps);
    assert.deepEqual(sessao.plano, antesPlano);
    assert.equal(sessao.rascunho.mode, antesModo);
  });
});
