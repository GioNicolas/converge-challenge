// A fala do Totti: o que o modelo recebe (pergunta em aberto, movimentos de conversa) e como a saída dele é lida.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lerSaidaDoModelo, montarMensagensConversa, perguntaEmAberto } from "../conversa";
import { ela, sessaoAberta, totti } from "./apoio";

describe("perguntaEmAberto", () => {
  it("fala com uma pergunta só: a pergunta inteira", () => {
    assert.equal(perguntaEmAberto([totti("É júnior, pleno ou sênior?")]), "É júnior, pleno ou sênior?");
  });

  it("fala com afirmação e pergunta: só a parte da pergunta", () => {
    const fala = "Fechado, então system design. O que pesa mais pra vocês: aguentar pico ou não perder dado?";
    assert.equal(perguntaEmAberto([totti(fala), ela("pode repetir?")]), "O que pesa mais pra vocês: aguentar pico ou não perder dado?");
  });

  it("depois de um resumo: a pergunta de fechamento", () => {
    const resumo =
      "Vai ser system design pra nível sênior. Vou olhar como ele lida com falhas no meio do pagamento. " +
      "São sessenta minutos, num clima tranquilo e com uma dica leve se ele travar. Quer mudar algo ou posso finalizar?";
    assert.equal(perguntaEmAberto([totti(resumo)]), "Quer mudar algo ou posso finalizar?");
  });

  it("fala sem pergunta não fecha a pergunta de antes", () => {
    const transcricao = [totti("O que reprova direto pra vocês?"), ela("pera, deixa eu ver aqui"), totti("Claro, sem pressa.")];
    assert.equal(perguntaEmAberto(transcricao), "O que reprova direto pra vocês?");
  });

  it("ponto dentro de palavra ou número não corta a pergunta", () => {
    assert.equal(perguntaEmAberto([totti("Prefere testar Node.js ou Go?")]), "Prefere testar Node.js ou Go?");
    assert.equal(perguntaEmAberto([totti("Vale até R$ 1.000 por mês? Ou mais?")]), "Ou mais?");
  });

  it("a fala de encerramento fecha a pergunta de antes", () => {
    const transcricao = [
      totti("Quer mudar algo ou posso finalizar?"),
      ela("pode finalizar"),
      totti("Agora é só revisar na tela e confirmar."),
      ela("o que você acha?"),
    ];
    assert.equal(perguntaEmAberto(transcricao), undefined);
  });

  it("sem pergunta nenhuma do Totti: undefined", () => {
    assert.equal(perguntaEmAberto([]), undefined);
    assert.equal(perguntaEmAberto([totti("Agora é só revisar na tela e confirmar."), ela("o que você acha?")]), undefined);
  });
});

describe("montarMensagensConversa", () => {
  it("o prompt de sistema traz os movimentos de conversa e o formato da resposta", () => {
    const [sistema] = montarMensagensConversa(sessaoAberta([ela("pode repetir?")]), { tipo: "confirmar_inicio" });
    assert.equal(sistema.role, "system");
    assert.match(sistema.content, /QUANDO A CONVERSA SAI DO ROTEIRO/);
    for (const movimento of ["repetir", "esclarecer", "responder", "seguir"]) {
      assert.ok(sistema.content.includes(`"${movimento}"`), `falta o movimento ${movimento}`);
    }
    assert.match(sistema.content, /"fala": "\.\.\.", "movimento": "seguir"/);
  });

  it("o prompt não proíbe mais repetir quando ela pede", () => {
    const [sistema, entrada] = montarMensagensConversa(sessaoAberta([ela("pode repetir?")]), { tipo: "confirmar_inicio" });
    assert.match(sistema.content, /Se ela pedir para repetir, repita\./);
    assert.match(entrada.content, /SUAS ÚLTIMAS FALAS \(não repita essas perguntas por conta própria; só se ela pedir\)/);
    assert.doesNotMatch(entrada.content, /\(não repita essas perguntas\)/);
  });

  it("a entrada traz a pergunta em aberto numa linha própria", () => {
    const [, entrada] = montarMensagensConversa(sessaoAberta([ela("pode repetir?")]), { tipo: "confirmar_inicio" });
    assert.match(entrada.content, /^PERGUNTA SUA EM ABERTO: É isso, ou quer focar em outra coisa\?$/m);
  });

  it("sem pergunta em aberto, a linha diz (nenhuma)", () => {
    const sessao = sessaoAberta();
    sessao.transcricao = [totti("Agora é só revisar na tela e confirmar."), ela("tá")];
    const [, entrada] = montarMensagensConversa(sessao, { tipo: "confirmar_inicio" });
    assert.match(entrada.content, /^PERGUNTA SUA EM ABERTO: \(nenhuma\)$/m);
  });
});

describe("lerSaidaDoModelo", () => {
  it("JSON com movimento", () => {
    assert.deepEqual(lerSaidaDoModelo('{"fala": "É júnior, pleno ou sênior?", "movimento": "repetir"}'), {
      fala: "É júnior, pleno ou sênior?",
      movimento: "repetir",
    });
  });

  it("JSON sem o campo vale seguir", () => {
    assert.deepEqual(lerSaidaDoModelo('{"fala": "O que reprova direto?"}'), { fala: "O que reprova direto?", movimento: "seguir" });
  });

  it("JSON dentro de cerca de código", () => {
    assert.deepEqual(lerSaidaDoModelo('```json\n{"fala": "Claro, sem pressa.", "movimento": "responder"}\n```'), {
      fala: "Claro, sem pressa.",
      movimento: "responder",
    });
  });

  it("texto puro continua válido e vale seguir", () => {
    assert.deepEqual(lerSaidaDoModelo("O que reprova direto pra vocês?"), { fala: "O que reprova direto pra vocês?", movimento: "seguir" });
  });

  it("movimento que não existe conta como ausente", () => {
    assert.deepEqual(lerSaidaDoModelo('{"fala": "Oi.", "movimento": "improvisar"}'), { fala: "Oi.", movimento: "seguir" });
  });

  it("JSON válido com a fala noutra chave aproveita a chave", () => {
    assert.deepEqual(lerSaidaDoModelo('{"texto": "O que reprova direto?", "movimento": "repetir"}'), {
      fala: "O que reprova direto?",
      movimento: "repetir",
    });
  });

  it("JSON sem fala nenhuma devolve fala vazia, nunca o JSON cru", () => {
    assert.deepEqual(lerSaidaDoModelo('{"fala": null, "movimento": "seguir"}'), { fala: "", movimento: "seguir" });
    assert.deepEqual(lerSaidaDoModelo('{"movimento": "seguir", "obs'), { fala: "", movimento: "seguir" });
  });

  it("JSON cortado depois de um preâmbulo aproveita a fala", () => {
    assert.deepEqual(lerSaidaDoModelo('Aqui está: {"fala": "O que pesa mais pra vocês'), {
      fala: "O que pesa mais pra vocês",
      movimento: "seguir",
    });
  });

  it("JSON cortado desfaz escapes unicode e descarta o escape incompleto", () => {
    assert.deepEqual(lerSaidaDoModelo('{"fala": "Voc\\u00ea prefere\\nqual? Voc\\u00'), {
      fala: "Você prefere qual? Voc",
      movimento: "seguir",
    });
  });

  it("JSON cortado no meio aproveita a fala", () => {
    assert.deepEqual(lerSaidaDoModelo('{"fala": "O que pesa mais: \\"pico\\" ou perda de dado?", "movi'), {
      fala: 'O que pesa mais: "pico" ou perda de dado?',
      movimento: "seguir",
    });
  });
});
