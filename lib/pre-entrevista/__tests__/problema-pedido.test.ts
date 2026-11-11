// Questão pedida pela recrutadora pelo nome (#78): leitura da fala, extrator, config e o que o Totti diz.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aplicarPedidoDeProblema, lerPedidoDeProblema, linhasDoPedido, problemaTemEvidencia } from "../problema-pedido";
import { aplicarPatch } from "../extrator";
import { paraInterviewConfig, type Rascunho } from "../rascunho";
import { conduzirTurno } from "../turno";
import { responder } from "../conversa";
import { comQuestaoSorteada, normalizarConfig } from "@/lib/config/store";
import { chatFalso, jevFalso, saida, sessaoAberta } from "./apoio";

const rascunhoDe = (mode: Rascunho["mode"] = "live_coding") => {
  const r = sessaoAberta().rascunho;
  return { ...r, mode };
};

describe("lerPedidoDeProblema: só fala de pedido conta", () => {
  it("reconhece a questão do banco pedida pelo nome", () => {
    for (const fala of ["Quero que use o two sum", "pode ser busca binária", "usa o problema dos parênteses válidos", "o exercício pode ser o two sum?"]) {
      assert.equal(lerPedidoDeProblema(fala)?.tipo, "problema", fala);
    }
    const l = lerPedidoDeProblema("Quero que use o two sum.");
    assert.equal(l?.tipo === "problema" && l.problema.id, "two-sum");
  });

  it("pedido de questão que não existe sai como desconhecido, com o nome pedido", () => {
    assert.deepEqual(lerPedidoDeProblema("Quero o problema das N rainhas na entrevista"), { tipo: "desconhecido", texto: "n rainhas" });
  });

  it("mencionar o assunto sem pedir, ou recusar, não fixa nada", () => {
    assert.equal(lerPedidoDeProblema("o time faz busca binária o dia todo"), undefined);
    assert.equal(lerPedidoDeProblema("não quero o two sum, é muito batido"), undefined);
    assert.equal(lerPedidoDeProblema("quero que ele resolva o problema do jeito dele"), undefined);
  });

  it("'pode sortear' é sorteio", () => {
    assert.equal(lerPedidoDeProblema("deixa o sorteio mesmo")?.tipo, "sorteio");
  });
});

describe("aplicarPedidoDeProblema", () => {
  it("live coding: questão do banco fica fixada", () => {
    const r = aplicarPedidoDeProblema(rascunhoDe(), "usa o two sum", 3);
    assert.equal(r.problemId, "two-sum");
    assert.deepEqual(r.pedidoProblema, { texto: "Two Sum", resultado: "reconhecido", turno: 3, origem: "fala" });
  });

  it("questão que não existe desfaz a fixação anterior; sorteio também", () => {
    const fixado = aplicarPedidoDeProblema(rascunhoDe(), "usa o two sum", 3);
    const naoExiste = aplicarPedidoDeProblema(fixado, "na verdade quero o problema das N rainhas", 5);
    assert.equal(naoExiste.problemId, undefined);
    assert.equal(naoExiste.pedidoProblema?.resultado, "nao_existe");
    const sorteio = aplicarPedidoDeProblema(fixado, "pode sortear", 5);
    assert.equal(sorteio.problemId, undefined);
    assert.equal(sorteio.pedidoProblema?.resultado, "sorteio");
  });

  it("system design: o pedido fica registrado e a resposta à pergunta do tema vira o tema", () => {
    const pedido = aplicarPedidoDeProblema(rascunhoDe("system_design"), "usa o two sum", 3);
    assert.equal(pedido.pedidoProblema?.resultado, "system_design");
    const tema = aplicarPedidoDeProblema(pedido, "algo de pagamentos com cartão", 5, "No quadro a questão é gerada para a vaga. Que tema você quer ver?");
    assert.equal(tema.pedidoProblema?.tema, "algo de pagamentos com cartão");
    const config = paraInterviewConfig(tema);
    assert.ok(config.ok && config.config.recruiterNotes.includes("Tema que ela quer ver no desafio do quadro: algo de pagamentos com cartão"));
  });

  it("sem pedido, nada muda", () => {
    const r = rascunhoDe();
    assert.equal(aplicarPedidoDeProblema(r, "isso, pode seguir", 3), r);
    assert.equal(aplicarPedidoDeProblema(r, "pode sortear", 3), r);
  });
});

describe("extrator: problemId passa pelo banco", () => {
  it("nome livre ('Two sum') vira o id do banco e fica fixado", () => {
    const r = aplicarPatch(rascunhoDe(), { problemId: "Two sum" });
    assert.equal(r.problemId, "two-sum");
    assert.equal(r.pedidoProblema?.resultado, "reconhecido");
  });

  it("nome que não existe: problemId vazio e aviso", () => {
    const avisos: string[] = [];
    const r = aplicarPatch(rascunhoDe(), { problemId: "N rainhas" }, avisos);
    assert.equal(r.problemId, undefined);
    assert.equal(r.pedidoProblema?.resultado, "nao_existe");
    assert.ok(avisos.some((a) => a.includes("N rainhas")));
  });

  it("o pedido lido da fala vence o do extrator", () => {
    const daFala = aplicarPedidoDeProblema(rascunhoDe(), "usa o two sum", 3);
    assert.equal(aplicarPatch(daFala, { problemId: "binary-search" }).problemId, "two-sum");
  });
});

describe("config: a questão pedida vale para toda entrevista da vaga", () => {
  it("pleno com Two Sum pedido: sai fixado, com o nível da questão, e a entrevista não sorteia", () => {
    const r = aplicarPedidoDeProblema({ ...rascunhoDe(), seniority: "pleno" }, "quero que use o two sum", 3);
    const resultado = paraInterviewConfig(r);
    assert.ok(resultado.ok);
    assert.equal(resultado.config.problemId, "two-sum");
    assert.equal(resultado.config.problemaFixado, true);
    assert.equal(resultado.config.difficulty, "facil");
    for (let i = 0; i < 20; i++) assert.equal(comQuestaoSorteada(normalizarConfig(resultado.config)).problemId, "two-sum");
  });

  it("sem pedido, nada é fixado", () => {
    const resultado = paraInterviewConfig(rascunhoDe());
    assert.ok(resultado.ok);
    assert.equal(resultado.config.problemaFixado, undefined);
  });
});

describe("conversa: o Totti responde com o que é verdade", () => {
  it("'quero que use o two sum': o modelo recebe que a questão existe e está fixada, e o resumo cita", async () => {
    const sessao = sessaoAberta();
    const falso = chatFalso(saida("A questão vai ser Two Sum. Se o tempo acabar, o que conta mais?", "responder"));
    await conduzirTurno(sessao, "Ah, quero que use o two sum", { chat: falso.chat, ...jevFalso({}) });
    assert.equal(sessao.rascunho.problemId, "two-sum");
    const enviado = falso.chamadas[0].map((m) => m.content).join("\n");
    assert.match(enviado, /ela pediu Two Sum, que está no banco/);

    const resumo = await responder(sessao, { tipo: "resumo_final" }, { chat: chatFalso(saida("Vai ser live coding pra nível pleno. Vou olhar o código.")).chat });
    assert.match(resumo.texto, /A questão vai ser Two Sum/);
  });

  it("'quero o problema das N rainhas': o modelo recebe que não existe e as alternativas, e nada é fixado", async () => {
    const sessao = sessaoAberta();
    const falso = chatFalso(saida("Essa não está disponível. Pode ser Two Sum ou Busca binária?", "responder"));
    await conduzirTurno(sessao, "Quero o problema das N rainhas", { chat: falso.chat, ...jevFalso({}) });
    assert.equal(sessao.rascunho.problemId, undefined);
    const enviado = falso.chamadas[0].map((m) => m.content).join("\n");
    assert.match(enviado, /que NÃO está no banco/);
    assert.equal(linhasDoPedido(sessao.rascunho, false)[0], "- questão: a que ela pediu ('n rainhas') não está no banco; segue o sorteio pelo nível e pelo foco.");
  });
});

describe("revisão do PR 120", () => {
  it("recusa e pedido na mesma fala: vale o pedido", () => {
    const l = lerPedidoDeProblema("não quero o two sum, prefiro busca binária");
    assert.equal(l?.tipo === "problema" && l.problema.id, "binary-search");
  });

  it("recusar a questão fixada volta ao sorteio", () => {
    const fixado = aplicarPedidoDeProblema(rascunhoDe(), "Quero o two sum", 3);
    assert.equal(fixado.problemId, "two-sum");
    const r = aplicarPedidoDeProblema(fixado, "na verdade não quero o two sum, é muito batido", 5);
    assert.equal(r.problemId, undefined);
    assert.equal(r.pedidoProblema, undefined);
  });

  it("palavra solta de apelido genérico não fixa questão", () => {
    assert.equal(lerPedidoDeProblema("quero alguém que suba rápido na escada de carreira"), undefined);
    assert.equal(lerPedidoDeProblema("quero alguém com parênteses de sobra no código"), undefined);
  });

  it("'um desafio de lógica' é tema, não nome de questão", () => {
    assert.equal(lerPedidoDeProblema("quero um desafio de lógica"), undefined);
  });

  it("sorteio no quadro não apaga o problemId do catálogo", () => {
    const base = { ...rascunhoDe("system_design"), problemId: "catalogo-x", pedidoProblema: { texto: "x", resultado: "system_design" as const, turno: 1, origem: "fala" as const } };
    assert.equal(aplicarPedidoDeProblema(base, "pode sortear", 3).problemId, "catalogo-x");
  });

  it("problemId do extrator sem citação da recrutadora não tem evidência", () => {
    const t = [{ role: "recrutadora" as const, text: "Vaga de backend pleno." }];
    assert.equal(problemaTemEvidencia("two-sum", t), false);
    assert.equal(problemaTemEvidencia("two-sum", [{ role: "recrutadora", text: "usa o two sum" }]), true);
  });
});
