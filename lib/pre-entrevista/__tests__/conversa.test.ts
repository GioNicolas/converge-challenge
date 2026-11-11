// A fala do Totti: o que o modelo recebe (pergunta em aberto, movimentos de conversa) e como a saída dele é lida.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  confirmacaoDeterministica,
  falaDelaNaoEraResposta,
  falaParaDigitar,
  focoDoResumo,
  lerSaidaDoModelo,
  montarMensagensConversa,
  movimentoDaFala,
  perguntaEmAberto,
  responder,
  perguntaNoEsclarecimento,
  semRepeticaoDaFalaDela,
} from "../conversa";
import { aplicarPasso, type Passo } from "../planejador";
import { chatFalso, ela, saida, sessaoAberta, totti } from "./apoio";

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

describe("responder: as travas obedecem ao movimento", () => {
  const APROFUNDAR: Passo = { tipo: "aprofundar", area: "tecnico", motivo: "inicial" };
  const OBVIA = "O que separa um candidato ótimo de um fraco em algoritmos?";

  it("fala `responder` com resposta e retomada da pergunta não é cortada", async () => {
    const fala = "Quer saber se o candidato vê essa conversa? Não vê, ela fica só com vocês. Voltando: é isso, ou quer focar em outra coisa?";
    const sessao = sessaoAberta([ela("antes disso, o candidato vai ver essa conversa")]);
    const r = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida(fala, "responder")).chat });
    assert.equal(r.texto, fala);
    assert.equal(r.movimento, "responder");
    assert.deepEqual(r.travas, []);
  });

  it("sem movimento, a mesma fala é cortada na primeira pergunta e a trava vai para o log", async () => {
    const fala = "Quer saber se o candidato vê essa conversa? Não vê, ela fica só com vocês. Posso seguir?";
    const sessao = sessaoAberta([ela("o candidato vai ver essa conversa")]);
    const r = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida(fala)).chat });
    assert.equal(r.texto, "Quer saber se o candidato vê essa conversa?");
    assert.deepEqual(
      r.travas.map((t) => t.trava),
      ["cortar_na_primeira_pergunta"],
    );
    const evento = sessao.logs.find((e) => e.tipo === "trava");
    assert.ok(evento, "falta o evento de trava no log");
    assert.deepEqual(evento.dados, {
      trava: "cortar_na_primeira_pergunta",
      antes: fala,
      depois: "Quer saber se o candidato vê essa conversa?",
      movimento: "seguir",
      passo: { tipo: "confirmar_inicio" },
    });
  });

  it("no passo aprofundar, repetição não é trocada por pergunta do banco", async () => {
    const sessao = sessaoAberta([ela("pode repetir?")]);
    const r = await responder(sessao, APROFUNDAR, { chat: chatFalso(saida(OBVIA, "repetir")).chat });
    assert.equal(r.texto, OBVIA);
    assert.deepEqual(r.travas, []);
  });

  it("no passo aprofundar, sem movimento, a pergunta óbvia continua sendo trocada pela do banco", async () => {
    const sessao = sessaoAberta([ela("isso")]);
    const r = await responder(sessao, APROFUNDAR, { chat: chatFalso(saida(OBVIA)).chat });
    assert.notEqual(r.texto, OBVIA);
    assert.match(r.texto, /\?$/);
    assert.deepEqual(
      r.travas.map((t) => t.trava),
      ["pergunta_do_banco"],
    );
  });

  it("no passo perguntar_contexto, fala `responder` sem pergunta não ganha a pergunta de contexto", async () => {
    const sessao = sessaoAberta([ela("pera, deixa eu abrir a vaga aqui")]);
    const r = await responder(sessao, { tipo: "perguntar_contexto" }, { chat: chatFalso(saida("Claro, sem pressa.", "responder")).chat });
    assert.equal(r.texto, "Claro, sem pressa.");
  });

  it("no passo confirmar_inicio, 'Claro, sem pressa.' com `responder` não ganha pergunta no fim", async () => {
    const sessao = sessaoAberta([ela("pera, deixa eu abrir a vaga aqui")]);
    const r = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida("Claro, sem pressa.", "responder")).chat });
    assert.equal(r.texto, "Claro, sem pressa.");
  });

  it("no passo confirmar_inicio, sem movimento, a fala sem pergunta continua ganhando uma", async () => {
    const sessao = sessaoAberta([ela("hum")]);
    const r = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida("A proposta é live coding pra nível pleno.")).chat });
    assert.equal(r.texto, "A proposta é live coding pra nível pleno. Prefere seguir assim ou mudar alguma coisa?");
  });

  it("fala `responder` mantém a palavra de reconhecimento do começo; sem movimento ela sai", async () => {
    const sessao = sessaoAberta([ela("desculpa, me distraí")]);
    const fala = "Certo, sem problema. É isso, ou quer focar em outra coisa?";
    const comMovimento = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida(fala, "responder")).chat });
    assert.equal(comMovimento.texto, fala);
    const semMovimento = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida("Certo, vamos lá. Posso seguir assim?")).chat });
    assert.equal(semMovimento.texto, "Vamos lá. Posso seguir assim?");
  });

  it("fala `esclarecer` ou `repetir` também mantém a palavra de reconhecimento do começo", async () => {
    const sessao = sessaoAberta([ela("como assim?")]);
    const fala = "Claro, quis dizer o critério de desempate. Qual pesa mais?";
    for (const movimento of ["esclarecer", "repetir"]) {
      const r = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida(fala, movimento)).chat });
      assert.equal(r.texto, fala, movimento);
      assert.deepEqual(r.travas, [], movimento);
    }
  });

  it("a limpeza de markdown, aspas e prefixo vale com qualquer movimento", async () => {
    const sessao = sessaoAberta([ela("tá me ouvindo?")]);
    const r = await responder(sessao, { tipo: "confirmar_inicio" }, { chat: chatFalso(saida("Totti: **Tô sim**, pode falar.", "responder")).chat });
    assert.equal(r.texto, "Tô sim, pode falar.");
  });

  it("no passo resumo_final, fala `responder` não ganha logística nem fechamento, e não é reescrita", async () => {
    const sessao = sessaoAberta([ela("a duração ficou quanto mesmo?")]);
    const falso = chatFalso(saida("Ficou em quarenta minutos. Posso finalizar?", "responder"));
    const r = await responder(sessao, { tipo: "resumo_final" }, { chat: falso.chat });
    assert.equal(r.texto, "Ficou em quarenta minutos. Posso finalizar?");
    assert.equal(falso.chamadas.length, 1);
    const revisao = await responder(sessao, { tipo: "resumo_final", revisao: true }, { chat: falso.chat });
    assert.equal(revisao.texto, "Ficou em quarenta minutos. Posso finalizar?");
  });

  it("no passo resumo_final, sem movimento, o resumo continua montado pelo código", async () => {
    const sessao = sessaoAberta([ela("pode resumir")]);
    const r = await responder(sessao, { tipo: "resumo_final" }, { chat: chatFalso(saida("Vai ser live coding pra nível pleno. Vou olhar a qualidade do código.")).chat });
    assert.match(r.texto, /^Vai ser live coding pra nível pleno\. Vou olhar a qualidade do código\. /);
    assert.match(r.texto, /minutos/);
    assert.match(r.texto, /posso finalizar\?$/);
  });

  it("texto puro, sem JSON, segue valendo como fala", async () => {
    const sessao = sessaoAberta([ela("isso")]);
    const r = await responder(sessao, { tipo: "perguntar_contexto" }, { chat: chatFalso("Tem algo que reprova direto pra vocês?").chat });
    assert.equal(r.texto, "Tem algo que reprova direto pra vocês?");
    assert.equal(r.movimento, "seguir");
  });
});

describe("movimentoDaFala: reserva para quando o modelo não declara o movimento", () => {
  const APROFUNDAR: Passo = { tipo: "aprofundar", area: "tecnico", motivo: "inicial" };
  const PERGUNTA = "Se o tempo acabar, o que conta mais: uma solução funcionando ou o caminho bem explicado?";

  /** O Totti fez a pergunta de aprofundamento e ela respondeu com `fala`. */
  function depoisDoAprofundamento(fala: string) {
    const sessao = sessaoAberta([ela("isso"), totti(PERGUNTA), ela(fala)]);
    sessao.plano = aplicarPasso(sessao.plano, APROFUNDAR);
    return sessao;
  }

  it("fala sem movimento que é quase a pergunta em aberto, com outro passo escolhido, conta como repetir", () => {
    const sessao = depoisDoAprofundamento("pode repetir?");
    const fala = "Se o tempo acabar, o que conta mais pra você: uma solução funcionando ou o caminho bem explicado?";
    assert.equal(movimentoDaFala("seguir", fala, sessao, { tipo: "perguntar_contexto" }), "repetir");
  });

  it("pergunta diferente da que estava em aberto segue como seguir", () => {
    const sessao = depoisDoAprofundamento("a solução funcionando");
    assert.equal(movimentoDaFala("seguir", "Tem algo que reprova direto pra vocês?", sessao, { tipo: "perguntar_contexto" }), "seguir");
  });

  it("vale a pergunta que vai para a voz (a primeira), não a última da fala", () => {
    const sessao = depoisDoAprofundamento("a solução funcionando");
    const novaDepoisAntiga = `Tem algo que reprova direto pra vocês? ${PERGUNTA}`;
    assert.equal(movimentoDaFala("seguir", novaDepoisAntiga, sessao, { tipo: "perguntar_contexto" }), "seguir");
    const antigaDepoisNova = `${PERGUNTA} Tem algo que reprova direto pra vocês?`;
    assert.equal(movimentoDaFala("seguir", antigaDepoisNova, sessao, { tipo: "perguntar_contexto" }), "repetir");
  });

  it("número com ponto na pergunta não parte a pergunta ao meio", () => {
    const pergunta = "Com 2.5 horas de prova, o que pesa mais: a solução funcionando ou o caminho bem explicado?";
    const sessao = sessaoAberta([ela("isso"), totti(pergunta), ela("pode repetir?")]);
    sessao.plano = aplicarPasso(sessao.plano, APROFUNDAR);
    assert.equal(movimentoDaFala("seguir", pergunta, sessao, { tipo: "perguntar_contexto" }), "repetir");
  });

  it("movimento declarado nunca é trocado", () => {
    const sessao = depoisDoAprofundamento("como assim?");
    assert.equal(movimentoDaFala("esclarecer", PERGUNTA, sessao, { tipo: "perguntar_contexto" }), "esclarecer");
  });

  it("nova tentativa da mesma pergunta pelo planejador não é repetição", () => {
    const sessao = sessaoAberta([ela("hum")]);
    assert.equal(movimentoDaFala("seguir", "É isso, ou quer focar em outra coisa?", sessao, { tipo: "confirmar_inicio" }), "seguir");
  });

  it("pergunta de nível e resposta a dúvida não contam como repetição", () => {
    const sessao = depoisDoAprofundamento("mas como isso é avaliado?");
    const duvida: Passo = { tipo: "responder_duvida", retomar: APROFUNDAR, seguidas: 1 };
    assert.equal(movimentoDaFala("seguir", PERGUNTA, sessao, duvida), "seguir");
    assert.equal(movimentoDaFala("seguir", PERGUNTA, sessao, { tipo: "perguntar_nivel" }), "seguir");
  });
});

describe("movimento nao_entendi (issue #76)", () => {
  const ESCOLHA = "Ele pode ir direto pra solução, ou você quer que ele explique o plano antes?";
  const APROFUNDAR: Passo = { tipo: "aprofundar", area: "tecnico", motivo: "inicial" };

  it("lerSaidaDoModelo lê o movimento novo, e o prompt o descreve", () => {
    assert.equal(lerSaidaDoModelo(saida("Não peguei essa.", "nao_entendi")).movimento, "nao_entendi");
    const [sistema] = montarMensagensConversa(sessaoAberta(), APROFUNDAR);
    assert.match(sistema.content, /Movimento "nao_entendi"/);
    assert.match(sistema.content, /Ele diz\s+expresso/);
  });

  it("a fala dela repetida no começo sai, e a pergunta fica", async () => {
    const sessao = sessaoAberta([totti(ESCOLHA), ela("Ele diz expresso.")]);
    const r = await responder(sessao, APROFUNDAR, { chat: chatFalso(saida(`Ele diz expresso. Não peguei essa. ${ESCOLHA}`, "nao_entendi")).chat });
    assert.equal(r.texto, `Não peguei essa. ${ESCOLHA}`);
    assert.equal(r.movimento, "nao_entendi");
    assert.ok(r.travas.some((t) => t.trava === "repeticao_da_fala_dela"));
  });

  it("sem pergunta na fala, a pergunta em aberto volta no fim", async () => {
    const sessao = sessaoAberta([totti(ESCOLHA), ela("Ele diz expresso.")]);
    const r = await responder(sessao, APROFUNDAR, { chat: chatFalso(saida("Não peguei essa.", "nao_entendi")).chat });
    assert.equal(r.texto, `Não peguei essa. ${ESCOLHA}`);
  });

  it("falaDelaNaoEraResposta: repetir, esclarecer e nao_entendi; responder e seguir não", () => {
    assert.deepEqual(
      ["repetir", "esclarecer", "nao_entendi", "responder", "seguir"].map((m) => falaDelaNaoEraResposta(m)),
      [true, true, true, false, false],
    );
  });

  it("falaParaDigitar oferece digitar e refaz a pergunta", () => {
    assert.equal(falaParaDigitar(ESCOLHA), `Não estou conseguindo te entender pela voz. Se preferir, digite a resposta aqui no chat. ${ESCOLHA}`);
  });
});

describe("semRepeticaoDaFalaDela", () => {
  it("tira a fala dela inteira do começo, sem ligar para caixa, acento e pontuação", () => {
    assert.equal(semRepeticaoDaFalaDela("Ele diz expresso. Não peguei essa?", "ele diz expresso"), "Não peguei essa?");
    assert.equal(semRepeticaoDaFalaDela("Só código, sem pressa, certo? Qual pesa mais?", "so codigo sem pressa"), "Certo? Qual pesa mais?");
  });

  it("fala dela curta, que não está inteira no começo ou que é a fala toda: nada muda", () => {
    assert.equal(semRepeticaoDaFalaDela("Pode ser. Qual pesa mais?", "pode ser"), "Pode ser. Qual pesa mais?");
    assert.equal(semRepeticaoDaFalaDela("Ele diz que prefere o plano. Certo?", "ele diz expresso"), "Ele diz que prefere o plano. Certo?");
    assert.equal(semRepeticaoDaFalaDela("Ele diz expresso.", "ele diz expresso"), "Ele diz expresso.");
    assert.equal(semRepeticaoDaFalaDela("Qual pesa mais?", undefined), "Qual pesa mais?");
  });
});

describe("confirmacaoDeterministica (issue #76)", () => {
  /** Sessão logo depois de um resumo de live coding pleno, 30 min, com o foco do rascunho. */
  function depoisDoResumo() {
    const sessao = sessaoAberta();
    sessao.resumo = {
      preferencias: { ...sessao.preferencias },
      duracaoMin: 30,
      mode: "live_coding",
      seniority: "pleno",
      foco: focoDoResumo(sessao.rascunho),
    };
    return sessao;
  }

  it("só a duração mudou: a frase de sempre", () => {
    const sessao = depoisDoResumo();
    sessao.preferencias = { ...sessao.preferencias, duracaoMin: 45 };
    assert.equal(confirmacaoDeterministica(sessao), "Ajustei quarenta e cinco minutos. Posso finalizar?");
  });

  it("formato mudou: a troca vem primeiro, a duração do formato como consequência", () => {
    const sessao = depoisDoResumo();
    sessao.rascunho = { ...sessao.rascunho, mode: "system_design" };
    assert.equal(
      confirmacaoDeterministica(sessao),
      "Troquei para system design, no quadro. Com isso a entrevista fica com quarenta e cinco minutos. Posso finalizar?",
    );
  });

  it("formato e dicas mudaram: troca primeiro, depois o outro ajuste", () => {
    const sessao = depoisDoResumo();
    sessao.rascunho = { ...sessao.rascunho, mode: "system_design" };
    sessao.preferencias = { ...sessao.preferencias, dicas: "nenhuma" };
    assert.equal(
      confirmacaoDeterministica(sessao),
      "Troquei para system design, no quadro. Com isso a entrevista fica com quarenta e cinco minutos. Também ajustei sem dicas. Posso finalizar?",
    );
  });

  it("formato mudou com duração dita por ela: a duração não é consequência", () => {
    const sessao = depoisDoResumo();
    sessao.rascunho = { ...sessao.rascunho, mode: "system_design" };
    sessao.preferencias = { ...sessao.preferencias, duracaoMin: 60 };
    assert.equal(confirmacaoDeterministica(sessao), "Troquei para system design, no quadro. Também ajustei sessenta minutos. Posso finalizar?");
  });

  it("nível mudou: começa pelo nível", () => {
    const sessao = depoisDoResumo();
    sessao.rascunho = { ...sessao.rascunho, seniority: "senior" };
    assert.equal(confirmacaoDeterministica(sessao), "Mudei o nível para sênior. Posso finalizar?");
  });

  it("foco mudou sem troca de formato, ou nada mudou: vai ao modelo", () => {
    const foco = depoisDoResumo();
    foco.rascunho = { ...foco.rascunho, focus: [{ area: "tecnico", weight: 0.6 }, { area: "pressao", weight: 0.4 }] };
    foco.preferencias = { ...foco.preferencias, duracaoMin: 45 };
    assert.equal(confirmacaoDeterministica(foco), undefined);
    assert.equal(confirmacaoDeterministica(depoisDoResumo()), undefined);
  });

  it("ela pediu um formato que não foi aplicado: não confirma o efeito colateral", () => {
    const sessao = depoisDoResumo();
    sessao.transcricao.push(ela("quero system design"));
    sessao.preferencias = { ...sessao.preferencias, tom: "desafiador" };
    assert.equal(confirmacaoDeterministica(sessao), undefined);
  });

  it("ela pediu um formato que não foi aplicado e o nível mudou: não confirma só o nível", () => {
    const sessao = depoisDoResumo();
    sessao.transcricao.push(ela("quero system design, sênior"));
    sessao.rascunho = { ...sessao.rascunho, seniority: "senior" };
    assert.equal(confirmacaoDeterministica(sessao), undefined);
  });

  it("formato e foco mudaram: a troca e depois como fica o foco", () => {
    const sessao = depoisDoResumo();
    sessao.rascunho = { ...sessao.rascunho, mode: "system_design", focus: [{ area: "tecnico", weight: 0.6 }, { area: "pressao", weight: 0.4 }] };
    const fala = confirmacaoDeterministica(sessao) ?? "";
    assert.match(fala, /^Troquei para system design, no quadro\. O foco fica em .+\. Com isso a entrevista/);
    assert.ok(fala.endsWith("Posso finalizar?"));
  });

  it("resumo guardado antes dos campos novos: só tom, dicas, duração e linguagens contam", () => {
    const sessao = depoisDoResumo();
    sessao.resumo = { preferencias: { ...sessao.preferencias }, duracaoMin: 30 };
    sessao.rascunho = { ...sessao.rascunho, seniority: "senior" };
    assert.equal(confirmacaoDeterministica(sessao), undefined);
    sessao.preferencias = { ...sessao.preferencias, duracaoMin: 45 };
    assert.equal(confirmacaoDeterministica(sessao), "Ajustei quarenta e cinco minutos. Posso finalizar?");
  });
});

describe("esclarecer termina em pergunta (issue #113)", () => {
  const ABERTA = "Você quer que ele faça contas de volume antes de desenhar, ou basta ele raciocinar sobre o pico de uso?";
  const APROFUNDAR: Passo = { tipo: "aprofundar", area: "escala_produto", motivo: "inicial" };
  const INDIRETA =
    "Eu quero saber se você prefere que o candidato use números exatos para dimensionar o sistema, ou se apenas o raciocínio " +
    "sobre o volume de transações já é o suficiente. Isso ajuda a definir o nível de detalhe que vamos cobrar na questão.";

  it("pergunta indireta vira direta, e a explicação de depois sai", () => {
    assert.equal(
      perguntaNoEsclarecimento(INDIRETA, ABERTA),
      "Você prefere que o candidato use números exatos para dimensionar o sistema, ou apenas o raciocínio sobre o volume de transações já é o suficiente?",
    );
  });

  it("frase antes da pergunta indireta fica", () => {
    assert.equal(
      perguntaNoEsclarecimento("É sobre o nível de detalhe. O que eu queria saber é se ele precisa fazer contas.", ABERTA),
      "É sobre o nível de detalhe. Ele precisa fazer contas?",
    );
  });

  it("só explicação: a pergunta em aberto volta no fim; sem ela, uma pergunta curta", () => {
    const explicacao = "Isso define se a questão cobra números ou só raciocínio.";
    assert.equal(perguntaNoEsclarecimento(explicacao, ABERTA), `${explicacao} ${ABERTA}`);
    assert.equal(perguntaNoEsclarecimento(explicacao, undefined), `${explicacao} O que você prefere?`);
  });

  it("fala que já pergunta fica como está", () => {
    assert.equal(perguntaNoEsclarecimento(ABERTA, ABERTA), ABERTA);
  });

  it("responder: a fala `esclarecer` sem '?' sai com pergunta, e a trava vai para o log", async () => {
    const sessao = sessaoAberta([totti(ABERTA), ela("como assim, não entendi o que você quer saber")]);
    const r = await responder(sessao, APROFUNDAR, { chat: chatFalso(saida(INDIRETA, "esclarecer")).chat });
    assert.equal(r.movimento, "esclarecer");
    assert.ok(r.texto.endsWith("?"));
    assert.deepEqual(
      r.travas.map((t) => t.trava),
      ["pergunta_no_esclarecer"],
    );
  });

  it("o prompt traz o exemplo de pergunta direta no esclarecer", () => {
    const [sistema] = montarMensagensConversa(sessaoAberta(), APROFUNDAR);
    assert.match(sistema.content, /Pergunte de forma direta, não\s+indireta/);
  });
});
