import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { InterviewConfig } from "../../contracts";
import { avaliacaoDoPlano, blocoDoPlano, escalarTempos, planoDaConfig } from "../plano";
import { estadoInicial, TEMPOS_PADRAO } from "../sessao/estado";
import { statusPermitidoNoEstado } from "../sessao/politica";
import { resolverAvaliacaoEstatica } from "../kits";
import { problemaPadrao } from "../../pre-entrevista/catalogo";

const config = (extra: Partial<InterviewConfig> = {}): InterviewConfig => ({
  id: "cfg-1",
  mode: "system_design",
  roleTitle: "Staff Engineer",
  seniority: "senior",
  focus: [
    { area: "escala_produto", weight: 0.7 },
    { area: "tecnico", weight: 0.3 },
    { area: "pressao", weight: 0 },
  ],
  recruiterNotes: "  time pequeno, precisa de autonomia  ",
  criteria: [{ id: "c1", name: "Escala", description: "pensa em escala", weight: 1, focus: "escala_produto" }],
  problemId: "encurtador-de-url",
  languages: ["python"],
  durationMin: 45,
  ...extra,
});

describe("planoDaConfig", () => {
  it("copia o que muda o agente e usa os padrões de tom e dicas", () => {
    const p = planoDaConfig(config());
    assert.equal(p.cargo, "Staff Engineer");
    assert.equal(p.senioridade, "senior");
    assert.equal(p.tom, "amigavel");
    assert.equal(p.dicas, "livres");
    assert.equal(p.notas, "time pequeno, precisa de autonomia");
    assert.equal(p.duracaoMin, 45);
  });

  it("respeita tom e dicas da recrutadora e corta notas longas", () => {
    const p = planoDaConfig(config({ tone: "desafiador", hints: "nenhuma", recruiterNotes: "x".repeat(900) }));
    assert.equal(p.tom, "desafiador");
    assert.equal(p.dicas, "nenhuma");
    assert.equal(p.notas.length, 500);
  });
});

describe("avaliacaoDoPlano", () => {
  it("mapeia os problemas do catálogo da pré-entrevista para kits do cérebro", () => {
    assert.equal(avaliacaoDoPlano(config({ problemId: "encurtador-de-url" })), "demo");
    assert.equal(avaliacaoDoPlano(config({ problemId: "chat-tempo-real" })), "demo-chat");
    assert.equal(avaliacaoDoPlano(config({ problemId: "pagamentos-instantaneos" })), "demo-pagamentos");
    assert.equal(avaliacaoDoPlano(config({ problemId: "chatbot-atendimento-ia" })), "demo-chatbot-ia");
  });

  it("todo problema de system design que a pré-entrevista escolhe tem avaliação estática no cérebro", () => {
    const ids = [
      problemaPadrao("system_design", ["tecnico"]),
      problemaPadrao("system_design", ["tecnico"], "Engenheira de Software Sênior — Backend (pagamentos)"),
      problemaPadrao("system_design", ["tecnico"], "Backend do app de mensagens em tempo real"),
      problemaPadrao("system_design", ["uso_ia"]),
    ];
    assert.deepEqual(ids, ["encurtador-de-url", "pagamentos-instantaneos", "chat-tempo-real", "chatbot-atendimento-ia"]);
    for (const id of ids) {
      const avaliacao = avaliacaoDoPlano(config({ problemId: id }));
      assert.ok(avaliacao && resolverAvaliacaoEstatica(avaliacao), `${id} sem avaliação estática`);
    }
  });
  it("problema desconhecido: undefined (quem chama usa a avaliação padrão)", () => {
    assert.equal(avaliacaoDoPlano(config({ problemId: "nao-existe" })), undefined);
  });
});

describe("escalarTempos", () => {
  const soma = (t: Record<string, number | undefined>) => Object.values(t).reduce<number>((a, s) => a + (s ?? 0), 0);
  it("escala as fases para a duração do plano", () => {
    const t = escalarTempos(TEMPOS_PADRAO, 70); // o dobro da referência (35 min)
    assert.ok(Math.abs(soma(t) - 70 * 60) <= 4, `soma ${soma(t)}`);
    assert.equal(t.REQUISITOS, (TEMPOS_PADRAO.REQUISITOS ?? 0) * 2);
  });
  it("nunca deixa uma fase com menos de 60 s", () => {
    const t = escalarTempos(TEMPOS_PADRAO, 1);
    for (const s of Object.values(t)) assert.ok((s ?? 60) >= 60);
  });
  it("sem duração, devolve os tempos como estão", () => {
    assert.deepEqual(escalarTempos(TEMPOS_PADRAO, undefined), TEMPOS_PADRAO);
  });
});

describe("blocoDoPlano", () => {
  it("sem plano, nada", () => {
    assert.equal(blocoDoPlano(null), "");
    assert.equal(blocoDoPlano(undefined), "");
  });
  it("lista cargo, senioridade, foco ordenado por peso (sem peso zero), tom e dicas", () => {
    const b = blocoDoPlano(planoDaConfig(config({ tone: "desafiador", hints: "leves" })));
    assert.match(b, /Staff Engineer/);
    assert.match(b, /sênior/);
    assert.ok(b.indexOf("escala, trade-offs") < b.indexOf("domínio técnico"), "mais peso primeiro");
    assert.doesNotMatch(b, /pressão/);
    assert.match(b, /desafiador/);
    assert.match(b, /no máximo uma dica/);
  });
  it("as notas entram como dado, entre marcas", () => {
    assert.match(blocoDoPlano(planoDaConfig(config())), /<notas>time pequeno, precisa de autonomia<\/notas>/);
  });
});

describe("dicas conforme o plano (statusPermitidoNoEstado)", () => {
  const emAprofundamento = (dicas?: "livres" | "leves" | "nenhuma") => ({
    ...estadoInicial({ plano: dicas ? planoDaConfig(config({ hints: dicas })) : null }),
    fase: "APROFUNDAMENTO" as const,
  });
  it("sem plano ou livres: dica permitida", () => {
    assert.equal(statusPermitidoNoEstado(emAprofundamento(), "dica"), true);
    assert.equal(statusPermitidoNoEstado(emAprofundamento("livres"), "dica"), true);
  });
  it("nenhuma: dica bloqueada, dúvida continua", () => {
    const e = emAprofundamento("nenhuma");
    assert.equal(statusPermitidoNoEstado(e, "dica"), false);
    assert.equal(statusPermitidoNoEstado(e, "duvida"), true);
  });
  it("leves: uma dica só", () => {
    const e = emAprofundamento("leves");
    assert.equal(statusPermitidoNoEstado(e, "dica"), true);
    const comUma = { ...e, perguntas: [{ numero: 1, status: "dica" as const, pergunta: "p", nota: null, elementos: [], degrau: 1, fase: "APROFUNDAMENTO" as const, feitaEm: 0 }] };
    assert.equal(statusPermitidoNoEstado(comUma, "dica"), false);
  });
});
