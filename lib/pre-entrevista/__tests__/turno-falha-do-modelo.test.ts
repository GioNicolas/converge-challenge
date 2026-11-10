// Falha do modelo com decisão pendente: a pergunta é refeita com a fala de reserva, e nada é decidido nem contado
// como adiamento, porque o modelo não devolveu decisão, ele falhou. LLM e Jev falsos.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conduzirTurno } from "../turno";
import { ErroChat, type ChatResposta } from "../llm";
import { falaDeReserva } from "../conversa";
import { CLASSIFICACAO, jevFalso, sessaoAberta } from "./apoio";
import type { Classificacao } from "../classificador";

/** A abertura já oferece a troca de formato: a primeira fala ambígua fica com decisão pendente de troca. */
const COM_IA: Classificacao = {
  ...CLASSIFICACAO,
  focus: [
    { area: "uso_ia", weight: 0.6 },
    { area: "tecnico", weight: 0.4 },
  ],
};
/** A vaga não diz o nível: a abertura pergunta, e uma fala ambígua fica com decisão pendente de nível. */
const SEM_NIVEL: Classificacao = { ...CLASSIFICACAO, nivelExplicito: 0.2, confirmar: ["seniority"] };

/** Fala de reserva da troca: a mesma de `falaDeReserva` para a oferta de system design. */
const FALA_DA_TROCA = "Não peguei qual caminho você prefere: trocar pra system design, deixar pra próxima etapa ou seguir sem?";

const chatQueFalha = async (): Promise<ChatResposta> => {
  throw new ErroChat("nenhum provedor respondeu", []);
};

/** Chat que devolve as respostas na ordem e falha quando a lista acaba. */
function chatComFalhas(...respostas: Array<string | Error>) {
  let chamadas = 0;
  const chat = async (): Promise<ChatResposta> => {
    const resposta = respostas[chamadas] ?? new ErroChat("nenhum provedor respondeu", []);
    chamadas += 1;
    if (resposta instanceof Error) throw resposta;
    return { content: resposta, ms: 1, provedor: "featherless", model: "falso", tentativas: [] };
  };
  return { chat };
}

const saidaComDecisao = (fala: string, decisao: string) => JSON.stringify({ fala, movimento: "responder", decisao });

describe("conduzirTurno: falha do modelo com decisão pendente não conta como adiamento", () => {
  it("nível: duas falhas seguidas refazem a pergunta e não decidem o nível", async () => {
    const sessao = sessaoAberta([], SEM_NIVEL);
    const adiamentosAntes = structuredClone(sessao.plano.adiamentos);
    const deps = { chat: chatQueFalha, ...jevFalso() };

    const primeiro = await conduzirTurno(sessao, "hum", deps);
    const segundo = await conduzirTurno(sessao, "sei lá", deps);

    assert.equal(primeiro.fala, falaDeReserva({ tipo: "nivel" }));
    assert.equal(segundo.fala, falaDeReserva({ tipo: "nivel" }));
    assert.equal(primeiro.movimento, "responder");
    assert.equal(segundo.movimento, "responder");
    assert.notEqual(sessao.plano.nivelPorEstimativa, true);
    assert.equal(sessao.rascunho.confirmado.seniority, false);
    assert.deepEqual(sessao.plano.adiamentos, adiamentosAntes);
  });

  it("troca: duas falhas seguidas não decidem a troca nem mudam o formato", async () => {
    const sessao = sessaoAberta([], COM_IA);
    const modoAntes = sessao.rascunho.mode;
    const adiamentosAntes = structuredClone(sessao.plano.adiamentos);
    const deps = { chat: chatQueFalha, ...jevFalso() };

    const primeiro = await conduzirTurno(sessao, "hum", deps);
    const segundo = await conduzirTurno(sessao, "sei lá", deps);

    assert.equal(primeiro.fala, FALA_DA_TROCA);
    assert.equal(segundo.fala, primeiro.fala);
    assert.equal(primeiro.movimento, "responder");
    assert.equal(segundo.movimento, "responder");
    assert.deepEqual(sessao.plano.decisoesTradeoff, {});
    assert.deepEqual(sessao.plano.adiamentos, adiamentosAntes);
    assert.equal(sessao.rascunho.mode, modoAntes);
  });

  it("adiamento real seguido de falha: o contador fica em 1 e nada é decidido", async () => {
    const sessao = sessaoAberta([], COM_IA);
    const { chat } = chatComFalhas(saidaComDecisao("Claro, sem pressa.", "adiar"));
    const deps = { chat, ...jevFalso() };

    const primeiro = await conduzirTurno(sessao, "hum, deixa eu pensar", deps);
    assert.equal(primeiro.fala, "Claro, sem pressa.");
    assert.equal(sessao.plano.adiamentos?.troca, 1);

    const segundo = await conduzirTurno(sessao, "sei lá", deps);
    assert.equal(segundo.fala, FALA_DA_TROCA);
    assert.equal(sessao.plano.adiamentos?.troca, 1);
    assert.deepEqual(sessao.plano.decisoesTradeoff, {});
    assert.equal(sessao.rascunho.mode, COM_IA.mode.value);
  });

  it("registra o aviso de decisão pendente falhou e nenhum evento de 'o modelo devolveu'", async () => {
    const sessao = sessaoAberta([], COM_IA);
    await conduzirTurno(sessao, "hum", { chat: chatQueFalha, ...jevFalso() });

    const resumos = sessao.logs.map((e) => e.resumo);
    assert.equal(
      resumos.some((r) => r.includes("o modelo devolveu")),
      false,
    );
    assert.equal(
      resumos.some((r) => r.includes("decisão pendente (troca) e o Totti falhou")),
      true,
    );
  });
});
