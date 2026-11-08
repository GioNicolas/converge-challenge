import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { comVezDevolvida, escolherConvite, limitarFrases, semPerguntaNoFim, trocarIdsPorNomes } from "../guardas";

describe("trocarIdsPorNomes", () => {
  const grafo = "COMPONENTES\n- [r5] Cache Redis (retângulo)\n- [e2] Réplica de leitura (elipse)\nCONEXÕES\n- [s5] Cache Redis → Réplica de leitura \"miss\"";
  it("troca ids entre colchetes e soltos pelo nome do elemento", () => {
    assert.equal(
      trocarIdsPorNomes("O que acontece se a chave não estiver no [r5] e a e2 receber muitas requisições?", grafo),
      "O que acontece se a chave não estiver no Cache Redis e a Réplica de leitura receber muitas requisições?",
    );
  });
  it("id desconhecido entre colchetes vira 'esse elemento'; texto sem id não muda", () => {
    assert.equal(trocarIdsPorNomes("E no [r9]?", grafo), "E no esse elemento?");
    assert.equal(trocarIdsPorNomes("Por que esse cache?", grafo), "Por que esse cache?");
  });
});

describe("semPerguntaNoFim", () => {
  it("tira a pergunta de condução do fim e põe um convite", () => {
    const r = semPerguntaNoFim("Sem problema, seguimos. Quer olhar outra parte do desenho?");
    assert.match(r, /^Sem problema, seguimos\. /);
    assert.doesNotMatch(r, /\?/);
  });
  it("fala só com pergunta vira um convite; fala sem pergunta não muda", () => {
    assert.doesNotMatch(semPerguntaNoFim("O que mais você quer detalhar?"), /\?/);
    assert.equal(semPerguntaNoFim("Tranquilo, continua daí."), "Tranquilo, continua daí.");
  });
});

describe("limitarFrases", () => {
  it("não corta decimais, porcentagens nem abreviações", () => {
    assert.equal(limitarFrases("São 2.5 mil por segundo e 99.9% no ar. Pode seguir. Outra.", 2), "São 2.5 mil por segundo e 99.9% no ar. Pode seguir.");
    assert.equal(limitarFrases("Use um número aprox. razoável. Continua daí.", 1), "Use um número aprox. razoável.");
  });
  it("texto sem pontuação final fica inteiro", () => {
    assert.equal(limitarFrases("Saquei, continua daí", 2), "Saquei, continua daí");
  });
});

describe("comVezDevolvida", () => {
  it("fala que para no fato ganha um convite no fim", () => {
    const t = comVezDevolvida("Isso, um bilhão de links novos por mês.");
    assert.match(t, /^Isso, um bilhão de links novos por mês\. (Pode|Continua)/);
  });
  it("pergunta ou próximo passo no fim ficam como estão", () => {
    assert.equal(comVezDevolvida("Saquei. E se o cache cair?"), "Saquei. E se o cache cair?");
    assert.equal(comVezDevolvida("São 5 anos. Pode seguir com esse número."), "São 5 anos. Pode seguir com esse número.");
  });
});

describe("convite do fim da fala", () => {
  it("sem histórico mantém a escolha de sempre, pelo tamanho do texto", () => {
    assert.equal(comVezDevolvida("Um. São 2.5 mil por segundo. Três."), `Um. São 2.5 mil por segundo. Três. ${escolherConvite("Um. São 2.5 mil por segundo. Três.")}`);
    assert.ok(["Pode continuar de onde parou.", "Continua daí.", "Pode seguir com o desenho."].includes(escolherConvite("abc")));
  });

  it("não repete o convite que o agente acabou de dizer", () => {
    const texto = "São 20 mil por dia.";
    const primeiro = escolherConvite(texto);
    const segundo = escolherConvite(texto, [`Certo. ${primeiro}`]);
    assert.notEqual(segundo, primeiro);
    const terceiro = escolherConvite(texto, [primeiro, segundo]);
    assert.ok(![primeiro, segundo].includes(terceiro));
  });

  it("ignora acento e pontuação ao comparar com o que já foi dito", () => {
    assert.notEqual(escolherConvite("a", ["pode continuar de onde parou"]), "Pode continuar de onde parou.");
  });

  it("se todos já foram ditos, volta à escolha de sempre em vez de travar", () => {
    const todos = ["Pode continuar de onde parou.", "Continua daí.", "Pode seguir com o desenho.", "Fica à vontade para seguir.", "Pode retomar de onde estava.", "Segue no seu ritmo."];
    assert.equal(escolherConvite("abc", todos), escolherConvite("abc"));
  });

  it("comVezDevolvida e semPerguntaNoFim usam o histórico", () => {
    const base = "São 20 mil por dia.";
    const usado = escolherConvite(base);
    assert.ok(!comVezDevolvida(base, [usado]).endsWith(usado));
    const comPergunta = "Entendi. Quer olhar outra parte?";
    const usado2 = escolherConvite(comPergunta);
    assert.ok(!semPerguntaNoFim(comPergunta, [usado2]).endsWith(usado2));
    assert.ok(!semPerguntaNoFim(comPergunta, [usado2]).includes("?"));
  });
});
