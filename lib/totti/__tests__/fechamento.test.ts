// O fechamento comum do Totti (lib/totti/fechamento.ts): quando começa, a fila das perguntas finais e a máquina de
// estados anuncio → perguntas_finais → ultima_palavra → despedida → encerrada (issue #96).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  aceitaEncerrar, aindaPensando, aoVoltarATrabalhar, DESPEDIDAS, escolherPerguntasFinais, gatilhoDoFechamento, iniciarFechamento,
  perguntasQueCabem, proximoPasso, type EstadoFechamento, type PassoDoFechamento, type PerguntaFinal,
} from "../fechamento";
import { comVezDevolvida, convitesPara, escolherConvite, semConviteDeSeguir, semPerguntaNoFim, semPerguntaNoFimSeSobrar } from "../guardas";
import type { LeituraDoTurno } from "../turno";

const MIN = 60_000;
const P1 = "Se o serviço de códigos cair, o que acontece com quem está criando link?";
const P2 = "Como você mediria se o cache está valendo a pena?";
const P3 = "O que você deixaria para uma segunda versão?";
const CANDIDATAS: PerguntaFinal[] = [{ pergunta: P1 }, { pergunta: P2 }, { pergunta: P3 }];

const lida = (extra: Partial<LeituraDoTurno> = {}): LeituraDoTurno => ({ responder: true, texto: "Saquei.", intencao: "respondeu", concluiu: false, encerrar: false, perguntou: false, ...extra });
const quieto = lida({ responder: false, texto: "" });

/** Manda o candidato seguir com o trabalho? (Nenhuma fala do fechamento pode.) */
const MANDA_SEGUIR = /\b(pode(mos)? (seguir|continuar|retomar|voltar|come[çc]ar)|continua da[íi]|segue no seu ritmo|fica [àa] vontade para seguir|de onde (parou|estava)|com o (c[óo]digo|desenho))\b/i;

/** Roda o fechamento com uma sequência de turnos e devolve cada passo. */
function rodar(inicio: EstadoFechamento, turnos: [fala: string, leitura: LeituraDoTurno][]): PassoDoFechamento[] {
  const passos = [proximoPasso(inicio)];
  for (const [fala, leitura] of turnos) passos.push(proximoPasso(passos.at(-1)!.estado, leitura, fala));
  return passos;
}

describe("quando o fechamento começa", () => {
  it("pedido para encerrar vai direto, qualquer que seja o resto", () => {
    assert.equal(gatilhoDoFechamento({ pediuEncerrar: true, tempoRestanteMs: 20 * MIN }), "pediu_encerrar");
  });
  it("\"terminei\" fecha na primeira vez com o material pronto, e na segunda de qualquer jeito", () => {
    assert.equal(gatilhoDoFechamento({ concluiu: true, materialPronto: true, conclusoesAntes: 0, tempoRestanteMs: 20 * MIN }), "concluiu");
    assert.equal(gatilhoDoFechamento({ concluiu: true, materialPronto: false, conclusoesAntes: 0, tempoRestanteMs: 20 * MIN }), null);
    assert.equal(gatilhoDoFechamento({ concluiu: true, materialPronto: false, conclusoesAntes: 1, tempoRestanteMs: 20 * MIN }), "concluiu");
  });
  it("tempo acabando fecha mesmo sem ele dizer que terminou", () => {
    assert.equal(gatilhoDoFechamento({ tempoRestanteMs: 2 * MIN }), "tempo");
    assert.equal(gatilhoDoFechamento({ tempoRestanteMs: 10 * MIN }), null);
    assert.equal(gatilhoDoFechamento({}), null);
  });
});

describe("a fila das perguntas finais", () => {
  it("a quantidade sai do tempo que resta: de 0 a 4", () => {
    assert.equal(perguntasQueCabem(undefined), 4);
    assert.equal(perguntasQueCabem(20 * MIN), 4);
    assert.equal(perguntasQueCabem(3 * MIN), 2);
    assert.equal(perguntasQueCabem(1 * MIN), 0);
    assert.equal(perguntasQueCabem(0), 0);
  });
  it("a prioridade manda; no empate, a ordem em que a sala entregou", () => {
    const fila = escolherPerguntasFinais([{ pergunta: P1 }, { pergunta: P2, prioridade: 2 }, { pergunta: P3 }], 20 * MIN);
    assert.deepEqual(fila.map((f) => f.pergunta), [P2, P1, P3]);
  });
  it("tira a que ele já ouviu e a repetida entre as candidatas", () => {
    const quaseP1 = "Se esse serviço de códigos cair, o que acontece com quem está criando um link?";
    assert.deepEqual(escolherPerguntasFinais([{ pergunta: P1 }, { pergunta: quaseP1 }, { pergunta: P2 }], 20 * MIN).map((f) => f.pergunta), [P1, P2]);
    assert.deepEqual(escolherPerguntasFinais(CANDIDATAS, 20 * MIN, [quaseP1]).map((f) => f.pergunta), [P2, P3]);
  });
  it("no máximo quatro, e só o que cabe no tempo", () => {
    const seis = [
      P1, P2, P3, "Por que o contador fica num serviço separado?", "Quanto custa guardar tudo isso por cinco anos?", "Quem avisa você quando o redirecionamento fica lento?",
    ].map((pergunta) => ({ pergunta }));
    assert.equal(escolherPerguntasFinais(seis).length, 4);
    assert.equal(escolherPerguntasFinais(seis, 3 * MIN).length, 2);
    assert.equal(escolherPerguntasFinais(seis, 1 * MIN).length, 0);
  });
});

describe("a máquina de estados", () => {
  it("conclusão com 3 candidatas e tempo de sobra: anúncio com a primeira pergunta, uma por vez, última palavra e despedida", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    assert.equal(inicio.etapa, "anuncio");
    const passos = rodar(inicio, [
      ["se cair, quem está criando recebe erro e tenta de novo", lida({ texto: "Saquei." })],
      ["eu olharia a taxa de acerto do cache", lida({ texto: "Certo." })],
      ["o painel de métricas ficaria para depois", lida({ texto: "Entendi." })],
      ["não, acho que é isso", quieto],
    ]);
    assert.equal(passos[0].fala, `Beleza. Só preciso fechar uns pontos com você antes de encerrar. ${P1}`);
    assert.equal(passos[1].fala, `Saquei. ${P2}`);
    assert.equal(passos[2].fala, `Certo. ${P3}`);
    assert.equal(passos[3].fala, "Entendi. Era isso da minha parte. Quer acrescentar alguma coisa antes de encerrar?");
    assert.ok(DESPEDIDAS.includes(passos[4].fala), passos[4].fala);
    assert.deepEqual(passos.map((p) => p.etapa), ["perguntas_finais", "perguntas_finais", "perguntas_finais", "ultima_palavra", "encerrada"]);
    assert.deepEqual(passos.map((p) => p.encerrar), [false, false, false, false, true]);
    // Depois da despedida não há mais fala.
    assert.deepEqual(proximoPasso(passos[4].estado, lida(), "oi?"), { fala: "", etapa: "encerrada", encerrar: true, estado: passos[4].estado });
  });

  it("conclusão com 1 minuto restante: sem perguntas, direto para a última palavra", () => {
    const inicio = iniciarFechamento({ sala: "codigo", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 1 * MIN });
    assert.deepEqual(inicio.fila, []);
    const passos = rodar(inicio, [["pode encerrar", quieto]]);
    assert.equal(passos[0].etapa, "ultima_palavra");
    assert.match(passos[0].fala, /Quer acrescentar alguma coisa antes de encerrar\?$/);
    assert.doesNotMatch(passos[0].fala, /fechar (um|uns) pontos?/);
    assert.equal(passos[1].encerrar, true);
  });

  it("tempo acabando: o anúncio diz por quê, e a fila encolhe se o tempo encurtar no meio", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "tempo", candidatas: CANDIDATAS, tempoRestanteMs: 3 * MIN });
    assert.equal(inicio.fila.length, 2);
    const primeiro = proximoPasso(inicio);
    assert.equal(primeiro.fala, `O nosso tempo está acabando. Só preciso fechar uns pontos com você antes de encerrar. ${P1}`);
    const segundo = proximoPasso(primeiro.estado, lida({ texto: "Tá." }), "recebe erro e tenta de novo", { tempoRestanteMs: 1 * MIN });
    assert.equal(segundo.etapa, "ultima_palavra");
    assert.equal(segundo.fala, "Tá. Era isso da minha parte. Quer acrescentar alguma coisa antes de encerrar?");
  });

  it("\"não sei\" no meio: aceita com leveza e passa para a próxima, sem insistir", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    const passos = rodar(inicio, [
      ["não sei, nunca pensei nisso", lida({ intencao: "nao_sabe", texto: "Tranquilo, deixa isso de lado. E o que você faria primeiro?", perguntou: true })],
      ["pula essa", lida({ intencao: "pulou", responder: false, texto: "" })],
    ]);
    assert.equal(passos[1].fala, `Tranquilo, deixa isso de lado. ${P2}`);
    assert.equal(passos[2].fala, `Tranquilo. ${P3}`);
    assert.equal(passos[2].estado.atual?.pergunta, P3);
  });

  it("no máximo um aprofundamento por pergunta", () => {
    const inicio = iniciarFechamento({ sala: "codigo", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    const passos = rodar(inicio, [
      ["recebe erro", lida({ texto: "Saquei. E quem tenta de novo, o cliente ou o servidor?", perguntou: true })],
      ["o cliente", lida({ texto: "Certo. E por quanto tempo ele tenta?", perguntou: true })],
    ]);
    assert.equal(passos[1].fala, "Saquei. E quem tenta de novo, o cliente ou o servidor?");
    assert.equal(passos[1].estado.atual?.pergunta, P1, "continua na mesma pergunta");
    assert.equal(passos[2].fala, `Certo. ${P2}`, "a segunda continuação do modelo não sai: vem a próxima pergunta final");
  });

  it("dúvida dele sobre a pergunta recebe a resposta e não gasta a pergunta", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    const passos = rodar(inicio, [["cair como, ficar fora do ar?", lida({ intencao: "perguntou", texto: "Isso, fora do ar por alguns minutos." })]]);
    assert.equal(passos[1].fala, "Isso, fora do ar por alguns minutos.");
    assert.equal(passos[1].estado.atual?.pergunta, P1);
  });

  it("quem ainda está pensando na resposta não é atropelado pela próxima pergunta", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    const primeiro = proximoPasso(inicio);
    const pensando = proximoPasso(primeiro.estado, quieto, "hmm, deixa eu pensar");
    assert.deepEqual(pensando, { fala: "", etapa: "perguntas_finais", encerrar: false, estado: primeiro.estado });
  });

  it("candidato volta a trabalhar: o fechamento é suspenso, menos depois da despedida", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    assert.equal(aoVoltarATrabalhar(inicio), null);
    const perguntando = proximoPasso(inicio);
    assert.equal(aoVoltarATrabalhar(perguntando.estado), null);
    const despedida = proximoPasso(perguntando.estado, lida({ encerrar: true, intencao: "encerrar", responder: false, texto: "" }), "pode encerrar");
    assert.equal(aoVoltarATrabalhar(despedida.estado), despedida.estado);
  });

  it("pedido de encerrar no meio: direto para a despedida", () => {
    const inicio = iniciarFechamento({ sala: "codigo", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    const passos = rodar(inicio, [["olha, eu prefiro encerrar agora", lida({ encerrar: true, intencao: "encerrar", responder: false, texto: "" })]]);
    assert.ok(DESPEDIDAS.includes(passos[1].fala));
    assert.equal(passos[1].etapa, "encerrada");
    assert.equal(passos[1].encerrar, true);
  });

  it("pedido de encerrar como gatilho: só a despedida", () => {
    const passo = proximoPasso(iniciarFechamento({ sala: "quadro", gatilho: "pediu_encerrar", candidatas: CANDIDATAS }));
    assert.ok(DESPEDIDAS.includes(passo.fala));
    assert.equal(passo.encerrar, true);
  });

  it("última palavra: assunto novo recebe uma resposta e a pergunta volta uma vez; na segunda, despede", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: [], tempoRestanteMs: 15 * MIN });
    const passos = rodar(inicio, [
      ["queria saber quando sai o resultado", lida({ intencao: "perguntou", texto: "Quem cuida do processo é quem dá o retorno. Pode seguir com o desenho." })],
      ["e eu fui bem?", lida({ intencao: "perguntou", texto: "Isso eu não consigo te dizer." })],
    ]);
    assert.equal(passos[0].fala, "Por mim, era isso. Quer acrescentar alguma coisa antes de encerrar?");
    assert.equal(passos[1].fala, "Quem cuida do processo é quem dá o retorno. Mais alguma coisa antes de encerrar?");
    assert.equal(passos[1].etapa, "ultima_palavra");
    assert.match(passos[2].fala, /^Isso eu não consigo te dizer\. /);
    assert.ok(DESPEDIDAS.some((d) => passos[2].fala.endsWith(d)));
    assert.equal(passos[2].encerrar, true);
  });

  it("o gesto da pergunta volta junto com a fala, sem ser lido", () => {
    const grifo = { startLine: 3, endLine: 5 };
    const inicio = iniciarFechamento({ sala: "codigo", gatilho: "concluiu", candidatas: [{ pergunta: P1, apontar: grifo }, { pergunta: P2 }] });
    const primeiro = proximoPasso(inicio);
    assert.equal(primeiro.apontar, grifo);
    assert.equal("apontar" in proximoPasso(primeiro.estado, lida(), "recebe erro"), false);
  });

  it("o estado é só dado: vai para o banco e volta igual", () => {
    const inicio = iniciarFechamento({ sala: "quadro", gatilho: "concluiu", candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
    const meio = proximoPasso(proximoPasso(inicio).estado, lida(), "recebe erro").estado;
    const deVolta = JSON.parse(JSON.stringify(meio)) as EstadoFechamento;
    assert.deepEqual(deVolta, meio);
    assert.deepEqual(proximoPasso(deVolta, lida({ texto: "Certo." }), "olharia a taxa de acerto"), proximoPasso(meio, lida({ texto: "Certo." }), "olharia a taxa de acerto"));
  });
});

describe("nenhuma fala do fechamento manda continuar o código ou o desenho", () => {
  it("nem as fixas, nem as que aproveitam a reação do modelo", () => {
    // O modelo, por hábito, termina com o convite: o fechamento tira.
    const comConvite = (texto: string, extra: Partial<LeituraDoTurno> = {}) => lida({ texto, ...extra });
    for (const sala of ["quadro", "codigo"] as const) {
      for (const gatilho of ["concluiu", "tempo"] as const) {
        const inicio = iniciarFechamento({ sala, gatilho, candidatas: CANDIDATAS, tempoRestanteMs: 15 * MIN });
        const passos = rodar(inicio, [
          ["recebe erro e tenta de novo", comConvite("Saquei. Pode seguir com o desenho.")],
          ["não sei", comConvite("Tranquilo, pode continuar de onde parou.", { intencao: "nao_sabe" })],
          ["ficaria para depois", comConvite("Pode seguir com o código.")],
          ["queria falar do custo", comConvite("Certo, anotado. Continua daí.")],
          ["só isso mesmo, e você?", comConvite("Fica à vontade para seguir.")],
        ]);
        for (const p of passos) assert.doesNotMatch(p.fala, MANDA_SEGUIR, `${sala}/${gatilho}: ${p.fala}`);
        assert.equal(passos.at(-1)!.encerrar, true);
      }
    }
    for (const d of DESPEDIDAS) assert.doesNotMatch(d, MANDA_SEGUIR);
  });

  it("a despedida não tem nota, elogio nem prazo", () => {
    for (const d of DESPEDIDAS) assert.doesNotMatch(d, /parab[ée]ns|[óo]tim|excelente|muito bem|mandou bem|foi bem|aprovad|nota|dias|semana|amanh[ãa]/i, d);
  });
});

describe("convites das guardas: no fechamento não entra convite para seguir", () => {
  it("escolherConvite, comVezDevolvida e as trocas de pergunta respeitam o momento", () => {
    for (const sala of ["quadro", "codigo"] as const) {
      assert.equal(escolherConvite("Certo.", [], sala, "fechamento"), "");
      assert.equal(comVezDevolvida("São 5 anos.", [], sala, "fechamento"), "São 5 anos.");
      assert.equal(semPerguntaNoFim("Tranquilo. Quer olhar outra parte?", [], sala, "fechamento"), "Tranquilo.");
      assert.equal(semPerguntaNoFimSeSobrar("Quer olhar outra parte?", sala, "fechamento"), "");
      // Fora do fechamento nada muda.
      assert.ok(convitesPara(sala).includes(escolherConvite("Certo.", [], sala)));
      assert.match(comVezDevolvida("São 5 anos.", [], sala), /^São 5 anos\. \S/);
    }
  });

  it("semConviteDeSeguir tira o convite e deixa o resto (pergunta nenhuma sai)", () => {
    assert.equal(semConviteDeSeguir("Saquei. Pode seguir com o desenho."), "Saquei.");
    assert.equal(semConviteDeSeguir("Tranquilo, pode continuar de onde parou."), "Tranquilo.");
    assert.equal(semConviteDeSeguir("Certo, anotado. Continua daí."), "Certo, anotado.");
    assert.equal(semConviteDeSeguir("Então pode seguir."), "");
    for (const sala of ["quadro", "codigo"] as const) for (const convite of convitesPara(sala)) assert.equal(semConviteDeSeguir(`Tá. ${convite}`), "Tá.", convite);
    for (const fica of ["Saquei. E se o cache cair?", "O tempo continua sendo linear.", "Quem cuida do processo é quem dá o retorno.", "Pode perguntar.", "Pode seguir assim ou prefere mudar?"]) {
      assert.equal(semConviteDeSeguir(fica), fica, fica);
    }
  });
});

describe("o que a fala do candidato mostra no fechamento", () => {
  it("aceita encerrar: resposta curta sem assunto novo, ou o pedido de encerrar", () => {
    for (const sim of ["não", "nada", "pode", "pode encerrar", "não, acho que é isso", "por mim tudo certo", "já falei tudo", "queria só dizer que pode fechar"]) assert.equal(aceitaEncerrar(sim), true, sim);
    for (const nao of ["queria saber quando sai o resultado dessa etapa do processo seletivo", "eu queria acrescentar uma coisa sobre o cache", ""]) assert.equal(aceitaEncerrar(nao), false, nao);
  });
  it("ainda pensando: só a fala curta de quem monta a resposta", () => {
    for (const sim of ["hmm", "hmm, deixa eu pensar", "deixa eu ver", "peraí", "um segundo", "calma, tô pensando", "to pensando", "pensando"]) assert.equal(aindaPensando(sim), true, sim);
    for (const nao of ["hmm, não sei", "nada", "pode encerrar", "eu olharia a taxa de acerto do cache", "então eu colocaria uma fila na frente do serviço de códigos para segurar o pico", ""]) assert.equal(aindaPensando(nao), false, nao);
  });
});

describe("o núcleo não depende das salas", () => {
  it("nenhum arquivo de lib/totti importa lib/agente nem lib/agents", () => {
    const pasta = path.join(process.cwd(), "lib", "totti");
    for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith(".ts"))) {
      const fonte = fs.readFileSync(path.join(pasta, arquivo), "utf8");
      assert.doesNotMatch(fonte, /from\s+["'][^"']*(\/agente\/|\/agents\/|\/agente["']|\/agents["'])/, arquivo);
    }
  });
});
