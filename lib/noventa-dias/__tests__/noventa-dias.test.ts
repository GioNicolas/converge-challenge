import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ajustarComResultado, mudancaDaRegra, regraDoCriterio } from "../ajuste";
import { garantiaDe, limparContratacoes, listarContratacoes, obterContratacao, registrarResultado, venceu } from "../store";
import { visaoDasContratacoes } from "../visao";
import { EMPRESA_DEMO, limparMemoria, listarMotivosIgnorados, regrasAtivas } from "@/lib/squad-memory/store";
import { comRegrasDaSquad } from "@/lib/squad-memory/config";

const BIANCA = "contratacao-bianca-nunes";

beforeEach(() => {
  limparContratacoes();
  limparMemoria();
});

test("a semente tem 3 contratações; a da Bianca venceu e espera resposta, e vem primeiro", () => {
  const lista = listarContratacoes(EMPRESA_DEMO, "backend-pagamentos");
  assert.equal(lista.length, 3);
  assert.equal(lista[0].id, BIANCA);
  assert.ok(venceu(lista[0]));
  assert.equal(lista[0].resultado, undefined);
  assert.equal(lista[0].entrevista.criterios.find((c) => c.id === "bordas")?.nota, 4);
});

test("garantia: conta só quem passou dos 90 dias", () => {
  const g = garantiaDe(listarContratacoes(EMPRESA_DEMO));
  assert.deepEqual(g, { aprovadas: 2, respondidas: 2, vencidas: 3, emExperiencia: 0 });
  const recente = { ...listarContratacoes(EMPRESA_DEMO)[0], contratadoEm: new Date().toISOString(), resultado: undefined };
  assert.equal(garantiaDe([recente]).emExperiencia, 1);
});

test("não deu certo num critério com nota alta: regra de rigor, com o fato", () => {
  const c = obterContratacao(BIANCA) ?? listarContratacoes(EMPRESA_DEMO)[0];
  const r = regraDoCriterio(c, false, "bordas");
  assert.equal(r?.efeito, "penaliza");
  assert.equal(r?.criterio, "bordas");
  assert.match(r!.texto, /^Penaliza caso de borda só citado, sem teste: Bianca Nunes tirou 4 em Casos de borda/);
  assert.deepEqual(mudancaDaRegra(r!), {
    criterio: "Casos de borda",
    manchete: "mais rigor",
    naEntrevista: "pede para escrever o teste do caso de borda: não basta citar",
  });
});

test("deu certo num critério com nota baixa: regra de crédito", () => {
  const c = listarContratacoes(EMPRESA_DEMO).find((x) => x.candidato === "Otávio Reis")!;
  const r = regraDoCriterio(c, true, "complexidade");
  assert.equal(r?.efeito, "valoriza");
  assert.equal(mudancaDaRegra(r!).manchete, "mais crédito");
  assert.equal(regraDoCriterio(c, true, "nao-existe"), undefined);
});

test("ajuste: a regra do critério entra ativa, com origem resultado_90_dias, e vai para a próxima entrevista", async () => {
  const c = listarContratacoes(EMPRESA_DEMO)[0];
  const antes = regrasAtivas(EMPRESA_DEMO).length;
  const ajuste = await ajustarComResultado(c, { deuCerto: false, criterioErrado: "bordas" }, null);
  assert.equal(ajuste.regras.length, 1);
  const [regra] = ajuste.regras;
  assert.deepEqual(regra.origem, {
    tipo: "resultado_90_dias",
    candidato: "Bianca Nunes",
    vagaId: "backend-pagamentos",
    deuCerto: false,
  });
  assert.equal(regrasAtivas(EMPRESA_DEMO).length, antes + 1);
  const config = comRegrasDaSquad({ mode: "live_coding" } as never, EMPRESA_DEMO) as { squadRules?: { id: string }[] };
  assert.ok(config.squadRules?.some((r) => r.id === regra.id));
});

test("ajuste: no máximo 2 regras, sem repetir o critério, e o guarda-corpo ignora o que não é técnico", async () => {
  const c = listarContratacoes(EMPRESA_DEMO)[0];
  const ajuste = await ajustarComResultado(
    c,
    {
      deuCerto: false,
      criterioErrado: "bordas",
      surpresa: "esquecia casos de borda; travou quando o incidente apertou; muito nova para o cargo",
    },
    null,
  );
  assert.ok(ajuste.regras.length <= 2);
  assert.equal(new Set(ajuste.regras.map((r) => r.criterio)).size, ajuste.regras.length);
  assert.equal(ajuste.regras[0].criterio, "bordas");
  assert.ok(ajuste.regras.some((r) => r.criterio === "pressao_adaptacao"));
  assert.equal(ajuste.ignorados.length, 1);
  assert.match(ajuste.ignorados[0].porque, /idade/);
  assert.equal(listarMotivosIgnorados(EMPRESA_DEMO).filter((m) => m.origem.tipo === "resultado_90_dias").length, 1);
});

test("acertou em tudo: nenhuma regra (só a surpresa técnica, se houver)", async () => {
  const c = listarContratacoes(EMPRESA_DEMO)[0];
  assert.equal((await ajustarComResultado(c, { deuCerto: true }, null)).regras.length, 0);
});

test("visão: a resposta mostra o ajuste; regra apagada some do ajuste", async () => {
  const c = listarContratacoes(EMPRESA_DEMO)[0];
  const ajuste = await ajustarComResultado(c, { deuCerto: false, criterioErrado: "bordas" }, null);
  registrarResultado(c.id, {
    deuCerto: false,
    criterioErrado: "bordas",
    respondidoEm: new Date().toISOString(),
    regras: ajuste.regras.map((r) => r.id),
    ignorados: [],
  });
  const visao = visaoDasContratacoes("backend-pagamentos", EMPRESA_DEMO);
  const vista = visao.contratacoes.find((x) => x.id === c.id)!;
  assert.equal(vista.ajuste?.regras[0].mudanca.manchete, "mais rigor");
  assert.deepEqual(visao.garantia, { aprovadas: 2, respondidas: 3, vencidas: 3, emExperiencia: 0 });
  // A do Otávio vem da semente da memória.
  assert.equal(visao.contratacoes.find((x) => x.candidato === "Otávio Reis")?.ajuste?.regras.length, 1);
});
