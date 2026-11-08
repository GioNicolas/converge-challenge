import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historicoDaConversa, perguntasFeitasEmTexto } from "../../prompts/contexto";
import { conversaSemRepeticao, estadoInicial, tempoDaEntrevista, transicionar, type EstadoSessao, type PerguntaFeita } from "../estado";

const T0 = 1_000_000;
const pergunta = (numero: number, extra: Partial<PerguntaFeita> = {}): PerguntaFeita => ({
  numero, status: "duvida", pergunta: `Pergunta ${numero}?`, nota: `nota ${numero}`, elementos: ["e1"], degrau: null,
  fase: "APROFUNDAMENTO", feitaEm: T0, ...extra,
});

describe("DESFECHO_DA_PERGUNTA", () => {
  const base: EstadoSessao = { ...estadoInicial(), fase: "APROFUNDAMENTO", perguntas: [pergunta(1), pergunta(2)], perguntaAtiva: pergunta(2) };
  it("marca a pergunta e a pergunta ativa, com a resposta cortada", () => {
    const { estado } = transicionar(base, { tipo: "DESFECHO_DA_PERGUNTA", numero: 2, desfecho: "nao_sabe", resposta: `  ${"x".repeat(500)} ` }, T0);
    assert.equal(estado.perguntas[1].desfecho, "nao_sabe");
    assert.equal(estado.perguntas[1].resposta?.length, 300);
    assert.equal(estado.perguntaAtiva?.desfecho, "nao_sabe");
    assert.equal(estado.perguntas[0].desfecho, undefined);
  });
  it("número desconhecido não muda nada", () => {
    const { estado } = transicionar(base, { tipo: "DESFECHO_DA_PERGUNTA", numero: 9, desfecho: "pulou", resposta: "" }, T0);
    assert.equal(estado, base);
  });
});

describe("tempoDaEntrevista", () => {
  it("usa a duração do plano e o tempo desde o começo", () => {
    const e = { ...estadoInicial(), iniciadaEm: T0, plano: { duracaoMin: 35 } as EstadoSessao["plano"] };
    assert.deepEqual(tempoDaEntrevista(e, T0 + 9 * 60_000 + 30_000), { totalMin: 35, decorridoMin: 9, restanteMin: 26 });
  });
  it("sem plano soma as fases; sem início estima pelas fases já passadas", () => {
    const e: EstadoSessao = { ...estadoInicial({ tempos: { REQUISITOS: 300, ALTO_NIVEL: 600 } }), fase: "ALTO_NIVEL", faseIniciadaEm: T0 };
    assert.deepEqual(tempoDaEntrevista(e, T0 + 60_000), { totalMin: 15, decorridoMin: 6, restanteMin: 9 });
  });
});

describe("memória da conversa", () => {
  it("fala repetida em seguida fica uma só", () => {
    const falas = [{ quem: "candidato" as const, texto: "oi" }, { quem: "candidato" as const, texto: "oi " }, { quem: "agente" as const, texto: "oi" }];
    assert.equal(conversaSemRepeticao(falas).length, 2);
  });
  it("junta a conversa do servidor com o que só o quadro tem, sem repetir", () => {
    const servidor = [{ quem: "candidato" as const, texto: "São 7 caracteres." }, { quem: "agente" as const, texto: "Anotado." }];
    const quadro = [{ quem: "agente" as const, texto: "Anotado." }, { quem: "candidato" as const, texto: "E agora o cache." }];
    assert.deepEqual(historicoDaConversa(servidor, quadro).map((f) => f.texto), ["São 7 caracteres.", "Anotado.", "E agora o cache."]);
  });
  it("respeita o limite de falas, ficando com as mais recentes", () => {
    const servidor = Array.from({ length: 50 }, (_, i) => ({ quem: (i % 2 ? "agente" : "candidato") as "agente" | "candidato", texto: `fala ${i}` }));
    const h = historicoDaConversa(servidor, [], 40);
    assert.equal(h.length, 40);
    assert.equal(h.at(-1)?.texto, "fala 49");
  });
  it("perguntas feitas mostram o desfecho e a resposta só quando ele respondeu", () => {
    const texto = perguntasFeitasEmTexto([
      pergunta(1, { desfecho: "nao_sabe", resposta: "não sei" }),
      pergunta(2, { desfecho: "respondeu", resposta: "uso um contador" }),
    ]);
    assert.match(texto, /1\..*NÃO SABE: assunto encerrado/);
    assert.doesNotMatch(texto, /Ele disse: "não sei"/);
    assert.match(texto, /2\..*respondeu\. Ele disse: "uso um contador"/);
  });
});
