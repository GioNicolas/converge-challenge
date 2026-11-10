import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pedeONivel, perguntaEmAberto, responder } from "../conversa";
import { chatFalso, saida, sessaoAberta, totti } from "./apoio";

describe("pergunta de nível na fala do Totti", () => {
  it("troca a pergunta reformulada e registra a trava para a resposta seguinte ser reconhecida", async () => {
    const sessao = sessaoAberta();
    const antes = "Para montar a entrevista, preciso confirmar o perfil. Qual é o nível da vaga?";
    const depois = "Para montar a entrevista, preciso confirmar o perfil. é júnior, pleno ou sênior?";

    const resposta = await responder(sessao, { tipo: "perguntar_nivel" }, { chat: chatFalso(saida(antes)).chat });

    assert.equal(resposta.texto, depois);
    assert.equal(resposta.movimento, "seguir");
    assert.equal(pedeONivel(perguntaEmAberto([totti(resposta.texto)])), true);
    assert.deepEqual(resposta.travas, [{ trava: "pergunta_de_nivel", antes, depois }]);
    const evento = sessao.logs.find((e) => e.tipo === "trava");
    assert.ok(evento, "falta registrar a trava no log da sessão");
    assert.deepEqual(evento.dados, { trava: "pergunta_de_nivel", antes, depois, movimento: "seguir", passo: { tipo: "perguntar_nivel" } });
  });

  it("mantém a fala quando a pergunta já traz as três opções", async () => {
    const sessao = sessaoAberta();
    const fala = "Para montar a entrevista, preciso confirmar o perfil. É júnior, pleno ou sênior?";

    const resposta = await responder(sessao, { tipo: "perguntar_nivel" }, { chat: chatFalso(saida(fala)).chat });

    assert.equal(resposta.texto, fala);
    assert.deepEqual(resposta.travas, []);
    assert.equal(sessao.logs.some((e) => e.tipo === "trava"), false);
  });

  it("confere as opções na pergunta em aberto, mesmo que tenham sido citadas antes", async () => {
    const sessao = sessaoAberta();
    const fala = "A vaga pode ser júnior, pleno ou sênior. Qual é o nível da vaga?";

    const resposta = await responder(sessao, { tipo: "perguntar_nivel" }, { chat: chatFalso(saida(fala)).chat });

    assert.equal(resposta.texto, "A vaga pode ser júnior, pleno ou sênior. é júnior, pleno ou sênior?");
    assert.equal(pedeONivel(perguntaEmAberto([totti(resposta.texto)])), true);
    assert.deepEqual(resposta.travas.map((trava) => trava.trava), ["pergunta_de_nivel"]);
  });

  for (const movimento of ["repetir", "esclarecer", "responder"] as const) {
    it(`não troca a pergunta quando o movimento é ${movimento}`, async () => {
      const sessao = sessaoAberta();
      const fala = "Qual é o nível da vaga?";

      const resposta = await responder(sessao, { tipo: "perguntar_nivel" }, { chat: chatFalso(saida(fala, movimento)).chat });

      assert.equal(resposta.texto, fala);
      assert.equal(resposta.movimento, movimento);
      assert.deepEqual(resposta.travas, []);
    });
  }
});
