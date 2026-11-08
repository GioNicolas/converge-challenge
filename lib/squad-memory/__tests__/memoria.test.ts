import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { aprenderComAjuste, aprenderComDecisao } from "../aprender";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { comRegrasDaSquad, regrasDaVaga, vagaDaConfig } from "../config";
import { regraAfeta } from "../criterios";
import { extrairPorPalavrasChave, extrairRegras } from "../extrator";
import { motivoNaoTecnico, triarMotivo } from "../guarda";
import { blocoDasRegras, regrasDoCriterio } from "../prompt";
import {
  adicionarRegra,
  alternarRegra,
  apagarRegra,
  concordancia,
  EMPRESA_DEMO,
  editarRegra,
  limparMemoria,
  listarMotivosIgnorados,
  listarRegras,
  regrasAtivas,
  registrarDecisao,
} from "../store";
import type { InterviewConfig } from "@/lib/contracts";

const EMPRESA = "empresa-teste";
const REPORT = { recommendation: "avancar" as const, overallScore: 3.1, criteria: [] };

beforeEach(() => limparMemoria());

test("guarda-corpo: idade, faculdade, sotaque e aparência não são técnicos", () => {
  assert.ok(motivoNaoTecnico("ele é muito velho para o time"));
  assert.ok(motivoNaoTecnico("não fez faculdade boa"));
  assert.ok(motivoNaoTecnico("tem um sotaque forte"));
  assert.ok(motivoNaoTecnico("a aparência não combina"));
  assert.ok(motivoNaoTecnico("ela está grávida"));
});

test("guarda-corpo: termos técnicos parecidos passam", () => {
  assert.equal(motivoNaoTecnico("propôs Kafka sem necessidade para esse volume"), undefined);
  assert.equal(motivoNaoTecnico("não tratou entrada mal formada"), undefined);
  assert.equal(motivoNaoTecnico("errou os nós filhos da árvore"), undefined);
  assert.equal(motivoNaoTecnico("caso particular de lista vazia"), undefined);
});

test("triagem separa a parte técnica da não técnica no mesmo motivo", () => {
  const t = triarMotivo("Propôs Kafka sem necessidade e é muito velho");
  assert.deepEqual(t.aceitos, ["Propôs Kafka sem necessidade"]);
  assert.equal(t.ignorados.length, 1);
  assert.match(t.ignorados[0].porque, /idade/);
});

test("palavras-chave: Kafka na reprovação vira penaliza over-engineering em trade-offs", () => {
  const regras = extrairPorPalavrasChave(
    { motivo: "", origem: { tipo: "reprovacao", candidato: "Rafael", vagaId: "v1" } },
    ["Reprovei porque propôs Kafka sem necessidade para esse volume"],
  );
  assert.equal(regras.length, 1);
  assert.equal(regras[0].efeito, "penaliza");
  assert.equal(regras[0].criterio, "tradeoffs");
  assert.match(regras[0].texto, /^Penaliza over-engineering: reprovou quem propôs Kafka/);
});

test("ajuste de plano: 'mais modelagem de dados' valoriza, 'menos algoritmo' não vira regra", () => {
  const regras = extrairPorPalavrasChave({ motivo: "", origem: { tipo: "ajuste_plano", vagaId: "v1" } }, [
    "menos algoritmo",
    "mais modelagem de dados",
  ]);
  assert.equal(regras.length, 1);
  assert.equal(regras[0].efeito, "valoriza");
  assert.equal(regras[0].criterio, "componentes");
});

test("extrator: motivo só não técnico não vira regra e é avisado", async () => {
  const r = await extrairRegras({ motivo: "não gostei do sotaque dele", origem: { tipo: "reprovacao", candidato: "A", vagaId: "v" } });
  assert.equal(r.regras.length, 0);
  assert.equal(r.ignorados.length, 1);
});

test("extrator com modelo: descarta critério inventado e regra com termo não técnico", async () => {
  const r = await extrairRegras(
    { motivo: "propôs Kafka sem necessidade", origem: { tipo: "reprovacao", candidato: "A", vagaId: "v" } },
    async () => ({
      regras: [
        { texto: "Penaliza over-engineering: reprovou quem propôs Kafka para volume baixo", efeito: "penaliza", criterio: "tradeoffs" },
        { texto: "Penaliza quem não fez faculdade", efeito: "penaliza", criterio: "abordagem" },
        { texto: "Valoriza algo", efeito: "valoriza", criterio: "criterio_inexistente" },
      ],
      naoTecnicos: [],
    }),
  );
  assert.equal(r.via, "modelo");
  assert.equal(r.regras.length, 1);
  assert.equal(r.regras[0].criterio, "tradeoffs");
  assert.equal(r.ignorados.length, 1);
});

test("extrator: modelo falhando cai nas palavras-chave", async () => {
  const r = await extrairRegras(
    { motivo: "propôs Kafka sem necessidade", origem: { tipo: "reprovacao", candidato: "A", vagaId: "v" } },
    async () => {
      throw new Error("sem rede");
    },
  );
  assert.equal(r.via, "palavras-chave");
  assert.equal(r.regras.length, 1);
});

test("store: adicionar, desligar, editar e apagar", () => {
  const regra = adicionarRegra({
    empresaId: EMPRESA,
    texto: "Penaliza over-engineering",
    efeito: "penaliza",
    criterio: "tradeoffs",
    origem: { tipo: "reprovacao", candidato: "A", vagaId: "v" },
  });
  assert.equal(regrasAtivas(EMPRESA).length, 1);
  alternarRegra(regra.id);
  assert.equal(regrasAtivas(EMPRESA).length, 0);
  assert.equal(listarRegras(EMPRESA).length, 1);
  editarRegra(regra.id, { texto: "Penaliza fila sem volume" });
  assert.equal(listarRegras(EMPRESA)[0].texto, "Penaliza fila sem volume");
  assert.equal(listarRegras(EMPRESA)[0].origem.tipo, "reprovacao");
  assert.ok(apagarRegra(regra.id));
  assert.equal(listarRegras(EMPRESA).length, 0);
});

test("concordância: por vaga em ordem de tempo, talvez fica de fora", () => {
  const d = (vagaId: string, rec: "avancar" | "talvez" | "nao_avancar", dec: "aprovado" | "reprovado", dia: number) =>
    registrarDecisao({
      empresaId: EMPRESA,
      vagaId,
      candidato: `c${dia}`,
      recomendacaoTotti: rec,
      decisaoTechLead: dec,
      decididaEm: new Date(2026, 8, dia).toISOString(),
    });
  d("v2", "avancar", "aprovado", 20);
  d("v1", "avancar", "reprovado", 1);
  d("v1", "nao_avancar", "reprovado", 2);
  d("v1", "talvez", "aprovado", 3);
  d("v2", "nao_avancar", "reprovado", 21);
  const c = concordancia(EMPRESA);
  assert.deepEqual(
    c.porVaga.map((v) => [v.vagaId, v.pct, v.semPosicao]),
    [
      ["v1", 50, 1],
      ["v2", 100, 0],
    ],
  );
  assert.equal(c.geral.pct, 75);
});

test("aprender com a reprovação: registra a decisão, cria a regra e guarda o ignorado", async () => {
  const a = await aprenderComDecisao(
    {
      empresaId: EMPRESA,
      vagaId: "backend",
      candidato: "Rafael",
      decisao: "reprovado",
      motivo: "propôs Kafka sem necessidade e é muito velho",
      report: REPORT,
    },
    null,
  );
  assert.equal(a.regras.length, 1);
  assert.equal(a.ignorados.length, 1);
  assert.equal(listarMotivosIgnorados(EMPRESA).length, 1);
  assert.equal(concordancia(EMPRESA).geral.total, 1);
  assert.equal(concordancia(EMPRESA).geral.concordou, 0);
});

test("aprovação sem motivo: só conta na concordância", async () => {
  const a = await aprenderComDecisao(
    { empresaId: EMPRESA, vagaId: "backend", candidato: "Ana", decisao: "aprovado", report: REPORT },
    null,
  );
  assert.equal(a.regras.length, 0);
  assert.equal(concordancia(EMPRESA).geral.pct, 100);
});

test("ajuste no plano vira regra com origem ajuste_plano", async () => {
  const a = await aprenderComAjuste({ empresaId: EMPRESA, vagaId: "backend", comentario: "mais modelagem de dados" }, null);
  assert.equal(a.regras[0].origem.tipo, "ajuste_plano");
});

test("regras chegam à config, ao prompt e ao critério da rubrica", () => {
  adicionarRegra({
    empresaId: EMPRESA,
    texto: "Penaliza over-engineering",
    efeito: "penaliza",
    criterio: "estimativa",
    origem: { tipo: "reprovacao", candidato: "A", vagaId: "v" },
  });
  const config = comRegrasDaSquad({ id: "c", vagaId: "v" } as InterviewConfig, EMPRESA);
  assert.equal(config.squadRules?.length, 1);
  assert.match(blocoDasRegras(config.squadRules, "perguntar"), /Critérios aprendidos com o Tech Lead/);
  assert.equal(blocoDasRegras([], "observar"), "");
  // "estimativa" (pré-entrevista) equivale a "escalabilidade" (rubrica do cérebro de system design).
  assert.equal(regrasDoCriterio(config.squadRules, "escalabilidade").length, 1);
  assert.ok(regraAfeta({ criterio: "componentes" }, "dados_consistencia"));
  assert.ok(!regraAfeta({ criterio: "tradeoffs" }, "bordas"));
});

// ---------------------------------------------------------------------------
// Uma regra só vale na vaga de onde veio
// ---------------------------------------------------------------------------

const regraNa = (vagaId: string, texto: string) =>
  adicionarRegra({
    empresaId: EMPRESA,
    texto,
    efeito: "penaliza",
    criterio: "bordas",
    origem: { tipo: "reprovacao", candidato: "A", vagaId },
  });

test("regra da vaga A não entra na entrevista da vaga B", () => {
  const daA = regraNa("vaga-a", "Penaliza quem não trata lista vazia");
  const daB = regraNa("vaga-b", "Penaliza quem não estima volume");
  const configA = comRegrasDaSquad({ id: "vaga-a" } as InterviewConfig, EMPRESA);
  const configB = comRegrasDaSquad({ id: "vaga-b" } as InterviewConfig, EMPRESA);
  assert.deepEqual(configA.squadRules?.map((r) => r.id), [daA.id]);
  assert.deepEqual(configB.squadRules?.map((r) => r.id), [daB.id]);
});

test("vaga nova começa sem regras de outras vagas e perde as que vieram na config salva", () => {
  regraNa("vaga-a", "Penaliza quem não trata lista vazia");
  assert.deepEqual(regrasDaVaga("vaga-nova", EMPRESA), []);
  assert.deepEqual(regrasDaVaga(undefined, EMPRESA), []);
  const antiga = { id: "vaga-nova", squadRules: [{ id: "x", text: "t", effect: "penaliza", criterion: "bordas" }] };
  assert.equal("squadRules" in comRegrasDaSquad(antiga as InterviewConfig, EMPRESA), false);
});

test("a vaga da config é o vagaId dela; sem ele, o próprio id", () => {
  assert.equal(vagaDaConfig({ id: "cfg-1", vagaId: "backend-pleno" }), "backend-pleno");
  assert.equal(vagaDaConfig({ id: "cfg-1" }), "cfg-1");
  const daVaga = regraNa("backend-pleno", "Penaliza quem não trata lista vazia");
  const config = comRegrasDaSquad({ id: "cfg-1", vagaId: "backend-pleno" } as InterviewConfig, EMPRESA);
  assert.deepEqual(config.squadRules?.map((r) => r.id), [daVaga.id]);
});

test("regra desligada da própria vaga também fica de fora", () => {
  const r = regraNa("vaga-a", "Penaliza quem não trata lista vazia");
  alternarRegra(r.id, false);
  assert.deepEqual(regrasDaVaga("vaga-a", EMPRESA), []);
});

test("o que se aprende no Slack volta para a mesma vaga, não para as outras", async () => {
  await aprenderComDecisao(
    {
      empresaId: EMPRESA,
      vagaId: "vaga-a",
      candidato: "Rafael",
      decisao: "reprovado",
      motivo: "propôs Kafka sem necessidade para esse volume",
      report: REPORT,
    },
    null,
  );
  await aprenderComAjuste({ empresaId: EMPRESA, vagaId: "vaga-b", comentario: "mais modelagem de dados" }, null);
  assert.deepEqual(regrasDaVaga("vaga-a", EMPRESA).map((r) => r.criterion), ["tradeoffs"]);
  assert.deepEqual(regrasDaVaga("vaga-b", EMPRESA).map((r) => r.criterion), ["componentes"]);
});

test("semente: o ajuste de plano de Engenharia de Dados não entra na entrevista Backend Pleno da demo", () => {
  const regras = comRegrasDaSquad(DEFAULT_CONFIG, EMPRESA_DEMO).squadRules ?? [];
  const ids = regras.map((r) => r.id);
  assert.ok(!ids.includes("semente-regra-modelagem"));
  assert.ok(!ids.includes("semente-regra-estimativa"));
  assert.ok(!ids.includes("semente-regra-observabilidade"));
  // As da vaga atual (Backend Pleno da demo) entram, e também a dos 90 dias do Otávio (outra vaga de backend da
  // empresa): o resultado de uma contratação ajusta a próxima entrevista nos critérios que ela usa.
  assert.deepEqual([...ids].sort(), ["semente-regra-90-dias-otavio", "semente-regra-custo", "semente-regra-plano-antes"]);
  // Toda regra da semente aponta para uma vaga que tem decisões (a tela mostra o nome da vaga).
  const vagas = new Set(concordancia(EMPRESA_DEMO).porVaga.map((v) => v.vagaId));
  for (const r of listarRegras(EMPRESA_DEMO)) assert.ok(vagas.has(r.origem.vagaId), r.id);
});
