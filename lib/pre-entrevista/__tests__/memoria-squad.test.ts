// A memória da squad na conversa: "da última vez vocês pediram X, mantenho?" na abertura e no resumo.
import test from "node:test";
import assert from "node:assert/strict";
import type { SquadRule } from "@/lib/contracts";
import type { Classificacao } from "../classificador";
import type { ResultadoCompetencias } from "../competencias";
import { aberturaDoAgente } from "../conversa";
import { criarSessao } from "../sessoes";
import { pedidoDaRegra, perguntaDaMemoria, regrasDoFormato, resumoDaMemoria } from "@/lib/squad-memory/fala";

const CLASSIFICACAO: Classificacao = {
  mode: { value: "live_coding", confidence: 0.95, probabilities: { live_coding: 0.95, system_design: 0.05 } },
  seniority: { value: "pleno", confidence: 0.9, probabilities: { junior: 0.05, pleno: 0.9, senior: 0.05 } },
  focusScores: [],
  focus: [{ area: "tecnico", weight: 1 }],
  nivelExplicito: 0.9,
  confirmar: [],
  usage: { inputTokens: null, ms: 0 },
  request: { state: null, questions: null },
  answers: null,
  model: "teste",
};
const VAGA = { roleTitle: "Backend Pleno", jobDescription: "APIs em Node e Postgres." };
const COMPETENCIAS: ResultadoCompetencias = { competencias: [], ms: 0, mensagens: [], tentativas: [] };

const BORDAS: SquadRule = {
  id: "r1",
  text: "Penaliza quem só testa o caminho feliz: reprovou quem não tratou lista vazia",
  effect: "penaliza",
  criterion: "bordas",
};
const ESTIMATIVA: SquadRule = {
  id: "r2",
  text: "Penaliza quem escolhe o banco sem estimar o volume de escrita",
  effect: "penaliza",
  criterion: "estimativa",
};
const ABORDAGEM: SquadRule = {
  id: "r3",
  text: "Valoriza quem explica o plano antes de codar",
  effect: "valoriza",
  criterion: "abordagem",
};

test("pedidoDaRegra vira o verbo no infinitivo e corta a explicação depois dos dois-pontos", () => {
  assert.equal(pedidoDaRegra(BORDAS.text), "penalizar quem só testa o caminho feliz");
  assert.equal(pedidoDaRegra("Valoriza modelagem de dados: o Tech Lead pediu mais modelagem"), "valorizar modelagem de dados");
  assert.equal(pedidoDaRegra("Olhar observabilidade."), "olhar observabilidade");
});

test("regrasDoFormato deixa só as regras dos critérios do formato", () => {
  assert.deepEqual(
    regrasDoFormato([BORDAS, ESTIMATIVA], ["abordagem", "bordas"]).map((r) => r.id),
    ["r1"],
  );
  assert.deepEqual(regrasDoFormato(undefined, ["bordas"]), []);
});

test("frases da memória citam no máximo duas regras e somem sem regra", () => {
  assert.equal(perguntaDaMemoria([]), undefined);
  assert.equal(resumoDaMemoria([]), undefined);
  const p = perguntaDaMemoria([BORDAS, ABORDAGEM, ESTIMATIVA])!;
  assert.match(
    p,
    /^Da última vez vocês pediram para penalizar quem só testa o caminho feliz e valorizar quem explica o plano antes de codar\./,
  );
  assert.doesNotMatch(p, /estimar/);
  assert.equal((p.match(/\?/g) ?? []).length, 1);
});

test("abertura sem memória continua igual", () => {
  const sessao = criarSessao(VAGA, CLASSIFICACAO, Date.now(), COMPETENCIAS);
  assert.match(aberturaDoAgente(sessao), /É isso, ou quer focar em outra coisa\?$/);
});

test("abertura com memória pergunta se mantém o que o time pediu, numa pergunta só", () => {
  const sessao = criarSessao(VAGA, CLASSIFICACAO, Date.now(), COMPETENCIAS, [BORDAS, ESTIMATIVA]);
  const fala = aberturaDoAgente(sessao);
  assert.match(fala, /Da última vez vocês pediram para penalizar quem só testa o caminho feliz\. Mantenho isso e sigo assim/);
  // A regra de system design não aparece numa entrevista de live coding.
  assert.doesNotMatch(fala, /estimar/);
  assert.equal((fala.match(/\?/g) ?? []).length, 1);
});

test("com o nível em aberto, a memória vira afirmação e a pergunta é a do nível", () => {
  const incerta: Classificacao = { ...CLASSIFICACAO, nivelExplicito: 0.2, confirmar: ["seniority"] };
  const sessao = criarSessao(VAGA, incerta, Date.now(), COMPETENCIAS, [BORDAS]);
  const fala = aberturaDoAgente(sessao);
  assert.match(fala, /Da última vez vocês pediram para penalizar quem só testa o caminho feliz, e eu mantenho\./);
  assert.match(fala, /júnior, pleno ou sênior\?$/);
});
