// O resultado do System Design no painel: a sessão aberta com a vaga entra no índice; ao fim da entrevista o
// scorecard sai sozinho e o /api/report lista o resultado (nota, recomendação e o cartão completo).
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { criarRepositorioEmMemoria, type RepositorioSessoes } from "../../../lib/agente/armazenamento";
import { criarClienteFalso } from "../../../lib/agente/llm/cliente";
import { definirContextoParaTestes } from "../../../lib/agente/rotas/contexto";
import { limitadorCriacao } from "../../../lib/agente/rotas/handlers";
import { criarLlmFalsoDeterministico } from "../../../lib/agente/rotas/llm-falso";
import { definirKvParaTestes, criarKvEmMemoria } from "../../../lib/storage/kv";
import { GET as relatorioGet } from "../report/route";
import { POST as criar } from "../sessoes/route";
import { POST as eventosPost } from "../sessoes/[id]/eventos/route";
import { POST as finalizarPost } from "../sessoes/[id]/finalizar/route";

let repo: RepositorioSessoes;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (url: string, corpo: unknown) =>
  new Request("http://x" + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });

const globais = globalThis as typeof globalThis & { __convergeConfigs?: Map<string, unknown> };
const ID_VAGA = "vaga-resultados-teste";

beforeEach(() => {
  repo = criarRepositorioEmMemoria();
  limitadorCriacao.reiniciar();
  definirKvParaTestes(criarKvEmMemoria());
  definirContextoParaTestes({ repositorio: repo, llm: criarLlmFalsoDeterministico(), agora: () => Date.now(), fake: true });
  (globais.__convergeConfigs ??= new Map()).set(ID_VAGA, {
    id: ID_VAGA, mode: "system_design", roleTitle: "Staff Engineer", seniority: "senior",
    focus: [{ area: "escala_produto", weight: 1 }], recruiterNotes: "",
    criteria: [{ id: "c1", name: "Escala", description: "d", weight: 1, focus: "escala_produto" }],
    problemId: "encurtador-de-url", languages: ["python"], durationMin: 30,
  });
});
afterEach(() => {
  definirContextoParaTestes(null);
  definirKvParaTestes(null);
  globais.__convergeConfigs?.delete(ID_VAGA);
});

async function novaSessao(configId?: string) {
  const r = await criar(post("/api/sessoes", { avaliacao_id: "demo", candidato_id: "c1", config_id: configId }));
  assert.equal(r.status, 200);
  return ((await r.json()) as { sessao_id: string }).sessao_id;
}

async function lista() {
  const r = await relatorioGet(new NextRequest("http://x/api/report"));
  assert.equal(r.status, 200);
  return (await r.json()) as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Espera uma condição que depende do trabalho em segundo plano. */
async function ate<T>(f: () => Promise<T | undefined | null | false>, ms = 4000): Promise<T> {
  const fim = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v;
    if (Date.now() > fim) throw new Error("a condição não ficou verdadeira a tempo");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("System Design no painel da vaga", () => {
  it("sessão aberta com a vaga aparece na lista como 'fazendo'; sem vaga, não aparece", async () => {
    const id = await novaSessao(ID_VAGA);
    await novaSessao(); // sem config: fora do painel
    const itens = (await lista()).filter((i) => i.formato === "system_design");
    assert.equal(itens.length, 1);
    assert.deepEqual(
      { sessionId: itens[0].sessionId, configId: itens[0].configId, roleTitle: itens[0].roleTitle, ended: itens[0].ended, state: itens[0].state },
      { sessionId: id, configId: ID_VAGA, roleTitle: "Staff Engineer", ended: false, state: "running" },
    );
    assert.equal(itens[0].href, `/relatorio/${id}`);
    assert.equal(itens[0].cartao, undefined);
  });

  it("ao encerrar a entrevista o scorecard sai sozinho e o resultado vai para a lista com o cartão completo", async () => {
    const id = await novaSessao(ID_VAGA);
    const t = new Date().toISOString();
    const r = await eventosPost(post(`/api/sessoes/${id}/eventos`, { eventos: [
      { horario: t, tipo: "fase", dados: { fase: "APROFUNDAMENTO" } },
      { horario: new Date(Date.now() + 1000).toISOString(), tipo: "fala", dados: { quem: "candidato", texto: "Vou usar um banco só." } },
      { horario: new Date(Date.now() + 2000).toISOString(), tipo: "fase", dados: { fase: "ENCERRADA" } },
    ] }), params(id));
    assert.equal(r.status, 200);

    const pronto = await ate(async () => (await lista()).find((i) => i.sessionId === id && i.state === "done"));
    assert.equal(pronto.ended, true);
    assert.equal(typeof pronto.overallScore === "number" || pronto.overallScore === undefined, true);
    assert.ok(["avancar", "avancar_com_ressalvas", "nao_avancar", "evidencia_insuficiente"].includes(pronto.recommendation));
    const cartao = pronto.cartao;
    assert.ok(cartao, "o cartão completo vai na lista");
    assert.ok(Array.isArray(cartao.pontosFortes) && Array.isArray(cartao.pontosFracos) && Array.isArray(cartao.criterios));
    assert.ok(cartao.criterios.length > 0);
    for (const c of cartao.criterios) assert.ok(c.nome && typeof c.justificativa === "string");
    assert.ok(await repo.obterScorecard(id), "o scorecard foi guardado");
  });

  it("finalizar à mão também atualiza a lista, e chamar de novo é idempotente (um scorecard só)", async () => {
    const id = await novaSessao(ID_VAGA);
    const a = await finalizarPost(post(`/api/sessoes/${id}/finalizar`, {}), params(id));
    assert.equal(a.status, 200);
    const b = await finalizarPost(post(`/api/sessoes/${id}/finalizar`, {}), params(id));
    assert.equal(b.status, 200);
    const item = (await lista()).find((i) => i.sessionId === id);
    assert.equal(item?.state, "done");
    assert.equal(item?.ended, true);
  });

  it("falha do modelo mantém a entrevista gerando e libera a tentativa encadeada", async () => {
    definirContextoParaTestes({ repositorio: repo, llm: criarClienteFalso([new Error("fora do ar")]), agora: () => Date.now(), fake: false });
    const id = await novaSessao(ID_VAGA);
    const r = await finalizarPost(post(`/api/sessoes/${id}/finalizar`, {}), params(id));
    assert.equal(r.status, 202);
    assert.equal((await lista()).find((i) => i.sessionId === id)?.state, "running");
    // nova tentativa (agora com o modelo de mentira que funciona) gera o scorecard
    definirContextoParaTestes({ repositorio: repo, llm: criarLlmFalsoDeterministico(), agora: () => Date.now(), fake: true });
    assert.equal((await finalizarPost(post(`/api/sessoes/${id}/finalizar`, {}), params(id))).status, 200);
    assert.equal((await lista()).find((i) => i.sessionId === id)?.state, "done");
  });
});
