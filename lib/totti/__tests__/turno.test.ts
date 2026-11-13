// A leitura do turno do Totti único (lib/totti/turno.ts): o que a fala do candidato mostra sem modelo, os
// adaptadores das duas salas e as decisões comuns (issue #95).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convitesPara } from "../guardas";
import {
  avisosDeQueVaiOlhar, candidatoPerguntou, comRespostaDeReserva, decidirTurno, deSaidaDoLiveCoding, deSaidaDoQuadro, ficouSemResposta,
  paraSaidaDoLiveCoding, paraSaidaDoQuadro, pareceConclusao, PEDIDOS_DE_REPETIR_A_PERGUNTA, perguntouComClareza, sinalDeConclusao,
  type LeituraDoTurno, type SituacaoDoTurno,
} from "../turno";

const situacao = (extra: Partial<SituacaoDoTurno> = {}): SituacaoDoTurno => ({ sala: "quadro", falaDoCandidato: "aí eu separo leitura de escrita", respondiaAoTotti: false, ...extra });
const lida = (extra: Partial<LeituraDoTurno> = {}): LeituraDoTurno => ({ responder: true, texto: "Certo.", intencao: "conversa", concluiu: false, encerrar: false, perguntou: false, ...extra });

describe("o candidato perguntou?", () => {
  it("o sinal largo pega a pergunta sem \"?\" e também o \"né\" do fim da frase", () => {
    for (const sim of ["criar uma pilha e conferir o topo o que que tu achou", "tá certo assim", "eu não vou ser penalizado né", "quanto tempo falta", "posso usar um dicionário", "aí eu ponho o cache aqui, né"]) {
      assert.equal(candidatoPerguntou(sim), true, sim);
    }
    for (const nao of ["agora vou montar o loop", "porque a pilha é last in first out", "deixa eu ver esse índice"]) assert.equal(candidatoPerguntou(nao), false, nao);
  });

  it("pergunta clara: dirigida ao Totti, ou com \"?\" que não é só o \"né?\" de quem pensa alto", () => {
    for (const clara of [
      "o que tu acha", "criar uma pilha e conferir o topo o que que tu achou", "tá certo assim", "meu código tá certo?", "quanto tempo falta",
      "posso usar um dicionário", "você pode me explicar o enunciado", "eu não vou ser penalizado né", "qual estrutura de dados você usaria aqui?",
      "acho que fica O(n²) por causa dos dois loops, faz sentido pra você?", "posso assumir que sempre existe uma resposta?",
    ]) assert.equal(perguntouComClareza(clara), true, clara);
    for (const narrando of [
      "agora vou montar o loop", "aí eu ponho o cache aqui, né?", "aí eu ponho o cache aqui né", "então eu tenho que percorrer o array",
      "isso faz sentido porque a leitura é maior", "aí fica assim, certo?", "hmm deixa eu ver esse índice aqui", "beleza, ok",
      "ué, deu errado no segundo teste, deixa eu olhar",
    ]) assert.equal(perguntouComClareza(narrando), false, narrando);
  });
});

describe("sinal auxiliar de conclusão", () => {
  it("reconhece o aviso de que terminou na última frase", () => {
    for (const fala of [
      "Eu acho que é isso, terminei.", "Eu disse que eu já terminei o meu desenho.", "Pronto.", "acho que é isso", "Acho que é isso que eu faria.",
      "pronto, terminei a primeira versão e os testes passaram", "É isso aí.", "Bom, acabei.", "acho que tá pronto", "é só isso", "não tenho mais nada",
    ]) assert.equal(pareceConclusao(fala), true, fala);
  });

  it("não confunde com quem ainda está trabalhando", () => {
    for (const fala of [
      "eu ainda não terminei", "terminei o cache, agora vou fazer a fila", "pronto, agora o banco", "quase pronto", "não tá pronto ainda",
      "quando eu terminar eu aviso", "deixa eu ver se terminei", "falta terminar a fila", "aí eu coloco o balanceador na frente",
      "é isso que eu ia falar do cache, mas falta a fila", "o problema disso é que o cache que já vem pronto do provedor não aguenta esse volume todo",
    ]) assert.equal(pareceConclusao(fala), false, fala);
  });

  it("\"pronto\" e \"é isso\" fecham a resposta, não o trabalho, quando ele respondia a uma pergunta do Totti", () => {
    assert.equal(pareceConclusao("eu uso um contador, acho que é isso.", true), false);
    assert.equal(pareceConclusao("eu uso um contador, acho que é isso.", false), true);
    assert.equal(pareceConclusao("eu uso um contador e terminei.", true), true);
  });

  it("só vale com as mãos paradas há alguns segundos, e a sala precisa saber dizer isso", () => {
    const fala = "Eu acho que é isso, terminei.";
    assert.equal(sinalDeConclusao(situacao({ falaDoCandidato: fala, paradoHaS: 12 })), true);
    assert.equal(sinalDeConclusao(situacao({ falaDoCandidato: fala, paradoHaS: 1 })), false);
    assert.equal(sinalDeConclusao(situacao({ falaDoCandidato: fala })), false);
    assert.equal(sinalDeConclusao(situacao({ falaDoCandidato: "aí eu coloco a fila", paradoHaS: 12 })), false);
  });
});

describe("adaptadores: a saída de cada sala vira a mesma leitura", () => {
  const respondendo = situacao({ respondiaAoTotti: true, falaDoCandidato: "não sei dizer" });

  it("os mesmos significados, com os nomes de cada sala", () => {
    const pares: [Parameters<typeof deSaidaDoLiveCoding>[0], Parameters<typeof deSaidaDoQuadro>[0], Partial<LeituraDoTurno>][] = [
      [{ reply: "Saquei. E o custo?" }, { responder: true, texto: "Saquei. E o custo?", desfecho: "respondeu" }, { responder: true, texto: "Saquei. E o custo?", intencao: "respondeu", perguntou: true }],
      [{ respond: false, reply: "" }, { responder: false, texto: "" }, { responder: false, texto: "", perguntou: false }],
      [{ reply: "Certo.", concluded: true }, { responder: true, texto: "Certo.", concluiu: true }, { concluiu: true, intencao: "concluiu" }],
      [{ reply: "", finish: true }, { responder: false, texto: "", encerrar: true }, { encerrar: true, intencao: "encerrar" }],
      [{ reply: "Tranquilo.", probeOutcome: { kind: "nao_conseguiu" } }, { responder: true, texto: "Tranquilo.", desfecho: "nao_sabe" }, { intencao: "nao_sabe" }],
      [{ reply: "Tranquilo.", probeOutcome: { kind: "recusou" } }, { responder: true, texto: "Tranquilo.", desfecho: "pulou" }, { intencao: "pulou" }],
    ];
    for (const [codigo, quadro, esperado] of pares) {
      const doCodigo = deSaidaDoLiveCoding(codigo, { ...respondendo, sala: "codigo" });
      const doQuadro = deSaidaDoQuadro(quadro, respondendo);
      for (const [campo, valor] of Object.entries(esperado)) {
        assert.equal(doCodigo[campo as keyof LeituraDoTurno], valor, `live coding, ${campo}: ${JSON.stringify(codigo)}`);
        assert.equal(doQuadro[campo as keyof LeituraDoTurno], valor, `quadro, ${campo}: ${JSON.stringify(quadro)}`);
      }
    }
  });

  it("sem marca do modelo, a intenção sai da fala e do momento", () => {
    const fala = { reply: "Certo." };
    assert.equal(deSaidaDoLiveCoding(fala, situacao({ falaDoCandidato: "o que tu acha" })).intencao, "perguntou");
    assert.equal(deSaidaDoLiveCoding(fala, situacao({ respondiaAoTotti: true })).intencao, "respondeu");
    assert.equal(deSaidaDoLiveCoding(fala, situacao()).intencao, "conversa");
    assert.equal(deSaidaDoQuadro({ responder: false, texto: "" }, situacao()).intencao, "pensando_alto");
  });

  it("o desfecho e a sondagem só valem quando havia pergunta do Totti em aberto; a dica mantém o assunto aberto", () => {
    assert.equal(deSaidaDoQuadro({ responder: true, texto: "Tranquilo.", desfecho: "nao_sabe" }, situacao()).intencao, "conversa");
    assert.equal(deSaidaDoLiveCoding({ reply: "Tranquilo.", probeOutcome: { kind: "nao_conseguiu" } }, situacao()).intencao, "conversa");
    assert.equal(deSaidaDoLiveCoding({ reply: "Quer uma dica?", probeOutcome: { kind: "nao_conseguiu" } }, respondendo).intencao, "respondeu");
  });

  it("o gesto da sala passa sem ser lido, e a volta só muda os campos comuns", () => {
    const grifo = { startLine: 2, endLine: 4 };
    const original = { respond: true, reply: "Saquei.", highlight: grifo, end: false, gaveHint: false, evidence: { criterionId: "c1", note: "n" } };
    const leitura = deSaidaDoLiveCoding(original, situacao());
    assert.equal(leitura.apontar, grifo);
    const volta = paraSaidaDoLiveCoding({ ...leitura, texto: "Saquei. Pode seguir.", concluiu: true }, original);
    assert.deepEqual(volta, { ...original, reply: "Saquei. Pode seguir.", concluded: true, finish: false });

    const doQuadro = { responder: true, texto: "Certo.", requisito: "100 milhões por mês", visual: [{ tipo: "apontar", alvo: "r1" }] };
    const lidaDoQuadro = deSaidaDoQuadro(doQuadro, situacao());
    assert.equal(lidaDoQuadro.apontar, doQuadro.visual);
    assert.deepEqual(paraSaidaDoQuadro({ ...lidaDoQuadro, responder: false }, doQuadro), { ...doQuadro, responder: false, texto: "", concluiu: false, encerrar: false });
  });
});

describe("quadro: sem convite repetido enquanto ele só reage", () => {
  // O Totti acabou de devolver a vez (convite) e o candidato só disse "tá": o convite não volta a sair.
  const reagiu = { respondiaAoTotti: true, falaDoCandidato: "Tá.", falasDoTotti: ["Pode seguir com o desenho."] };

  it("sem o sinal, a reação ganha o convite de sempre (o comportamento de antes)", () => {
    const r = decidirTurno(lida({ intencao: "respondeu", texto: "Certo." }), situacao({ sala: "quadro", ...reagiu }));
    assert.match(r.leitura.texto, /^Certo\. \S/);
    assert.ok(r.regras.includes("vez_devolvida"));
  });

  it("com o sinal (desde o convite ele só reagiu), a reação sai sem convite nenhum", () => {
    const r = decidirTurno(lida({ intencao: "respondeu", texto: "Certo." }), situacao({ sala: "quadro", ...reagiu, semAcaoDesdeOConvite: true }));
    assert.equal(r.leitura.texto, "Certo.");
    assert.deepEqual(r.regras, []);
  });

  it("com o sinal, a fala que só devolve um fato também não ganha convite a mais", () => {
    const fato = lida({ intencao: "respondeu", texto: "Isso, um bilhão por mês." });
    const r = decidirTurno(fato, situacao({ sala: "quadro", respondiaAoTotti: true, falaDoCandidato: "Tá.", semAcaoDesdeOConvite: true }));
    assert.equal(r.leitura.texto, "Isso, um bilhão por mês.");
  });

  it("o live coding não usa o sinal: a fala de sempre (sem convite para reação)", () => {
    const r = decidirTurno(lida({ intencao: "respondeu", texto: "Certo." }), situacao({ sala: "codigo", ...reagiu, semAcaoDesdeOConvite: true }));
    assert.equal(r.leitura.texto, "Certo.");
  });

  it("\"pensando\" é uma leitura de pensando alto, sem resposta", () => {
    const r = deSaidaDoQuadro({ responder: false, texto: "", desfecho: "pensando" }, situacao({ sala: "quadro", respondiaAoTotti: true }));
    assert.equal(r.intencao, "pensando_alto");
    assert.equal(r.responder, false);
  });
});

describe("decisões comuns", () => {
  it("\"não sei\" ou \"pula\": sem pergunta nova na mesma fala, com um próximo passo", () => {
    for (const sala of ["quadro", "codigo"] as const) {
      const s = situacao({ sala, respondiaAoTotti: true, falaDoCandidato: "não sei" });
      for (const intencao of ["nao_sabe", "pulou"] as const) {
        const r = decidirTurno(lida({ intencao, texto: "Tranquilo, seguimos. E como você trataria a colisão?", perguntou: true }), s);
        assert.doesNotMatch(r.leitura.texto, /\?/, `${sala}/${intencao}`);
        assert.match(r.leitura.texto, /^Tranquilo, seguimos\./);
        assert.equal(r.leitura.perguntou, false);
        assert.ok(r.regras.includes("sem_pergunta_nova"));
      }
      // Era só a pergunta: fica o convite da sala.
      const soPergunta = decidirTurno(lida({ intencao: "nao_sabe", texto: "E como você trataria a colisão?", perguntou: true }), s);
      assert.ok(convitesPara(sala).includes(soPergunta.leitura.texto), soPergunta.leitura.texto);
    }
  });

  it("travado no trabalho, a pergunta do Totti é ajuda e fica", () => {
    const s = situacao({ sala: "codigo", respondiaAoTotti: true, falaDoCandidato: "não sei como seguir", ajudando: true });
    const r = decidirTurno(lida({ intencao: "nao_sabe", texto: "Tranquilo. Onde você travou?", perguntou: true }), s);
    assert.equal(r.leitura.texto, "Tranquilo. Onde você travou?");
  });

  it("quem respondeu a uma pergunta do Totti não ouve só um \"Tá.\", em nenhuma das salas", () => {
    for (const sala of ["quadro", "codigo"] as const) {
      const r = decidirTurno(lida({ intencao: "respondeu", texto: "Tá." }), situacao({ sala, respondiaAoTotti: true }));
      assert.match(r.leitura.texto, /^Tá\. \S/, sala);
      assert.ok(convitesPara(sala).some((c) => r.leitura.texto.endsWith(c)), r.leitura.texto);
      assert.deepEqual(r.regras, ["vez_devolvida"]);
    }
    // Fora de uma pergunta dele, a reação solta é só uma reação.
    assert.equal(decidirTurno(lida({ texto: "Tá." }), situacao()).leitura.texto, "Tá.");
  });

  it("resposta que para num fato: no quadro entra o convite; na IDE o balão fecha e ela basta", () => {
    const fato = lida({ intencao: "respondeu", texto: "Isso, um bilhão de links novos por mês." });
    assert.match(decidirTurno(fato, situacao({ sala: "quadro", respondiaAoTotti: true })).leitura.texto, /por mês\. (Pode|Continua|Segue|Fica)/);
    assert.equal(decidirTurno(fato, situacao({ sala: "codigo", respondiaAoTotti: true })).leitura.texto, fato.texto);
    // Fala que já devolve a vez (pergunta ou próximo passo) fica como está nas duas.
    for (const sala of ["quadro", "codigo"] as const) {
      const pergunta = lida({ intencao: "respondeu", texto: "Saquei. E se o cache cair?", perguntou: true });
      assert.deepEqual(decidirTurno(pergunta, situacao({ sala, respondiaAoTotti: true })), { leitura: pergunta, regras: [] });
    }
  });

  it("\"terminei\" com as mãos paradas conta como conclusão mesmo sem a marca do modelo", () => {
    for (const sala of ["quadro", "codigo"] as const) {
      const s = situacao({ sala, falaDoCandidato: "Eu acho que é isso, terminei.", paradoHaS: 10 });
      for (const leitura of [lida({ responder: false, texto: "", intencao: "pensando_alto" }), lida({ texto: "Certo." })]) {
        const r = decidirTurno(leitura, s);
        assert.equal(r.leitura.concluiu, true, sala);
        assert.equal(r.leitura.intencao, "concluiu");
        assert.ok(r.regras.includes("sinal_de_conclusao"));
      }
      assert.equal(decidirTurno(lida(), { ...s, paradoHaS: 0 }).leitura.concluiu, false, `${sala}: ainda mexendo`);
    }
  });

  it("pedido para encerrar passa direto: quem fecha é a sala", () => {
    const encerrar = lida({ responder: false, texto: "", intencao: "encerrar", encerrar: true });
    assert.deepEqual(decidirTurno(encerrar, situacao({ falaDoCandidato: "terminei, pode encerrar", paradoHaS: 10 })), { leitura: encerrar, regras: [] });
  });

  it("quem ficou quieto continua quieto (o silêncio é decisão do modelo)", () => {
    const quieto = lida({ responder: false, texto: "", intencao: "pensando_alto" });
    assert.deepEqual(decidirTurno(quieto, situacao({ respondiaAoTotti: true })), { leitura: quieto, regras: [] });
  });
});

describe("pergunta clara nunca fica sem resposta", () => {
  const quieto = lida({ responder: false, texto: "", intencao: "perguntou" });

  it("a sala sabe quando gerar de novo", () => {
    assert.equal(ficouSemResposta(quieto, situacao({ falaDoCandidato: "o que tu acha" })), true);
    assert.equal(ficouSemResposta(lida({ texto: "" }), situacao({ falaDoCandidato: "o que tu acha" })), true, "responder true com a fala vazia também é silêncio");
    assert.equal(ficouSemResposta(quieto, situacao({ falaDoCandidato: "aí eu ponho o cache aqui, né?" })), false);
    assert.equal(ficouSemResposta(lida(), situacao({ falaDoCandidato: "o que tu acha" })), false);
    assert.equal(ficouSemResposta({ ...quieto, encerrar: true }, situacao({ falaDoCandidato: "posso encerrar?" })), false);
  });

  it("se nem a segunda geração respondeu, o Totti pede para repetir, sem repetir o pedido anterior", () => {
    const s = situacao({ falaDoCandidato: "o que tu acha" });
    const r = comRespostaDeReserva(quieto, s);
    assert.deepEqual(r.regras, ["pergunta_sem_resposta"]);
    assert.equal(r.leitura.responder, true);
    assert.equal(r.leitura.texto, PEDIDOS_DE_REPETIR_A_PERGUNTA[0]);
    assert.equal(comRespostaDeReserva(quieto, { ...s, falasDoTotti: [PEDIDOS_DE_REPETIR_A_PERGUNTA[0]] }).leitura.texto, PEDIDOS_DE_REPETIR_A_PERGUNTA[1]);
    assert.deepEqual(comRespostaDeReserva(lida(), s), { leitura: lida(), regras: [] });
  });
});

describe("aviso de que vai olhar", () => {
  it("é o mesmo nas duas salas, só com o material trocado", () => {
    assert.deepEqual(avisosDeQueVaiOlhar("quadro"), ["Tá, deixa eu dar uma olhada no desenho.", "Certo, só um instante que eu olho o que você fez."]);
    assert.deepEqual(avisosDeQueVaiOlhar("codigo").map((a) => a.replace("no código", "no desenho")), avisosDeQueVaiOlhar("quadro"));
  });
});
