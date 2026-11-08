import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eSoReacao, limitarFrases, semEcoNoComeco, semPerguntaNoFim, semPerguntaNoFimV2, trocarIdsPorNomes } from "../guardas";

describe("eSoReacao", () => {
  it("reconhece reação sem conteúdo", () => {
    for (const t of ["Hm.", "Hmm", "Tá.", "Certo, beleza.", "Uhum.", "Ok"]) assert.equal(eSoReacao(t), true, t);
  });
  it("não confunde com fala que tem conteúdo ou convite", () => {
    for (const t of ["Hm. E onde fica o contador?", "Pode seguir.", "Tá, vai em frente.", "", undefined]) assert.equal(eSoReacao(t), false, String(t));
  });
});

describe("semEcoNoComeco", () => {
  const fala = "Para gerar o código curto eu vou usar um contador e converter para base 62.";
  it("tira a abertura que só repete o candidato com as palavras dele", () => {
    assert.equal(semEcoNoComeco("Contador com base 62. E onde ele fica guardado?", fala), "E onde ele fica guardado?");
    assert.equal(
      semEcoNoComeco("Redis na frente do banco para a leitura. Pode seguir.", "Na leitura eu coloco um Redis como cache na frente do banco."),
      "Pode seguir.",
    );
    assert.equal(
      semEcoNoComeco("Postgres. Como você lida com o volume de leitura?", "Vou guardar os links num Postgres."),
      "Como você lida com o volume de leitura?",
    );
  });
  it("tira \"Entendi que…\", \"Então você…\" e \"Ou seja…\"", () => {
    assert.equal(semEcoNoComeco("Entendi que você vai usar um contador global. E se ele cair?", fala), "E se ele cair?");
    assert.equal(semEcoNoComeco("Eu entendi, você separa leitura e escrita. Continua.", fala), "Continua.");
    assert.equal(semEcoNoComeco("Então você quer evitar colisão. Pode seguir.", fala), "Pode seguir.");
    assert.equal(semEcoNoComeco("Ou seja, cada servidor tem a sua faixa. Continua daí.", fala), "Continua daí.");
  });
  it("mantém a fala quando não sobra nada depois do eco", () => {
    assert.equal(semEcoNoComeco("Entendi que você vai usar base 62.", fala), "Entendi que você vai usar base 62.");
  });
  it("mantém reação curta e conteúdo que não é eco", () => {
    assert.equal(semEcoNoComeco("Entendi. E onde ele fica guardado?", fala), "Entendi. E onde ele fica guardado?");
    assert.equal(semEcoNoComeco("Tá. E se esse serviço cair no meio do dia?", fala), "Tá. E se esse serviço cair no meio do dia?");
  });
  it("não mexe na resposta a uma pergunta do candidato (confirmar usa as mesmas palavras)", () => {
    const pergunta = "Tem que dar para o usuário escolher o código, tipo um apelido personalizado?";
    assert.equal(semEcoNoComeco("Sim, o usuário pode escolher o código. É opcional.", pergunta), "Sim, o usuário pode escolher o código. É opcional.");
  });
});

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

describe("semPerguntaNoFimV2", () => {
  it("tira a pergunta do fim e não acrescenta convite quando sobra fala", () => {
    assert.equal(semPerguntaNoFimV2("Sem problema, seguimos. Quer olhar outra parte do desenho?"), "Sem problema, seguimos.");
  });
  it("fala só com pergunta vira um convite; fala sem pergunta não muda", () => {
    assert.doesNotMatch(semPerguntaNoFimV2("O que mais você quer detalhar?"), /\?/);
    assert.equal(semPerguntaNoFimV2("Tranquilo, continua daí."), "Tranquilo, continua daí.");
  });
});
