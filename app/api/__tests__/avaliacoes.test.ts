// Testes das rotas /api/avaliacoes/* e da criação de sessão para avaliações geradas. Sem rede, LLM falso.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { criarRepositorioEmMemoria } from "../../../lib/agente/armazenamento";
import { kitFalso } from "../../../lib/agente/kits/falso";
import { criarRepositorioAvaliacoesEmMemoria, definirRepositorioAvaliacoesParaTestes } from "../../../lib/agente/kits/repositorio";
import { criarClienteFalso } from "../../../lib/agente/llm/cliente";
import { limitadorGeracao } from "../../../lib/agente/rotas/avaliacoes";
import { definirContextoParaTestes } from "../../../lib/agente/rotas/contexto";
import { limitadorCriacao } from "../../../lib/agente/rotas/handlers";
import { JOB_POSTINGS } from "../../../lib/hiring/mocks/job-postings";
import { POST as criar } from "../avaliacoes/route";
import { GET as obter, PUT as substituir } from "../avaliacoes/[id]/route";
import { POST as aprovar } from "../avaliacoes/[id]/aprovar/route";
import { POST as criarSessao } from "../sessoes/route";

const SEGREDO = "segredo-de-teste-123";
const vaga = JOB_POSTINGS.find((v) => v.id === "staff-engineer")!;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function req(url: string, metodo: string, corpo?: unknown, headers: Record<string, string> = { "x-api-key": SEGREDO }): Request {
  return new Request("http://x" + url, {
    method: metodo,
    headers: { "content-type": "application/json", ...headers },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

let antesSegredo: string | undefined;
let antesPermitir: string | undefined;

beforeEach(() => {
  antesSegredo = process.env.AVALIACOES_API_SECRET;
  antesPermitir = process.env.AGENTE_PERMITIR_NAO_APROVADA;
  process.env.AVALIACOES_API_SECRET = SEGREDO;
  delete process.env.AGENTE_PERMITIR_NAO_APROVADA;
  definirRepositorioAvaliacoesParaTestes(criarRepositorioAvaliacoesEmMemoria());
  limitadorGeracao.reiniciar();
  limitadorCriacao.reiniciar();
  definirContextoParaTestes({
    repositorio: criarRepositorioEmMemoria(),
    llm: criarClienteFalso((a) => (a.nomeSchema === "kit_avaliacao" ? kitFalso(vaga.title) : {})),
    agora: () => 1_000_000,
  });
});
afterEach(() => {
  if (antesSegredo === undefined) delete process.env.AVALIACOES_API_SECRET;
  else process.env.AVALIACOES_API_SECRET = antesSegredo;
  if (antesPermitir === undefined) delete process.env.AGENTE_PERMITIR_NAO_APROVADA;
  else process.env.AGENTE_PERMITIR_NAO_APROVADA = antesPermitir;
  definirContextoParaTestes(null);
  definirRepositorioAvaliacoesParaTestes(null);
});

async function gerar(): Promise<string> {
  const r = await criar(req("/api/avaliacoes", "POST", { vaga }));
  assert.equal(r.status, 201);
  return (await r.json()).avaliacao_id;
}

describe("segredo (fail closed)", () => {
  it("sem header, com header errado ou sem segredo configurado: 401 em todas as rotas", async () => {
    const id = "av_00000000-0000-0000-0000-000000000000";
    const chamadas = (h: Record<string, string>) => [
      criar(req("/api/avaliacoes", "POST", { vaga }, h)),
      obter(req("/api/avaliacoes/x", "GET", undefined, h), params(id)),
      substituir(req("/api/avaliacoes/x", "PUT", {}, h), params(id)),
      aprovar(req("/api/avaliacoes/x/aprovar", "POST", undefined, h), params(id)),
    ];
    for (const rs of [await Promise.all(chamadas({})), await Promise.all(chamadas({ "x-api-key": "errado" }))]) {
      for (const r of rs) assert.equal(r.status, 401);
    }
    delete process.env.AVALIACOES_API_SECRET;
    for (const r of await Promise.all(chamadas({ "x-api-key": "" }))) assert.equal(r.status, 401);
    for (const r of await Promise.all(chamadas({ "x-api-key": "undefined" }))) assert.equal(r.status, 401);
  });
});

describe("POST /api/avaliacoes", () => {
  it("201 com resumo; o kit fica salvo e não aprovado", async () => {
    const r = await criar(req("/api/avaliacoes", "POST", { vaga }));
    assert.equal(r.status, 201);
    const c = await r.json();
    assert.match(c.avaliacao_id, /^av_[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(c.resumo).sort(), ["area", "criterios", "modoLeitura", "persona", "titulo_problema"]);
    assert.equal(c.resumo.criterios.length, 6);
    const g = await (await obter(req("/api/avaliacoes/x", "GET"), params(c.avaliacao_id))).json();
    assert.equal(g.aprovado, false);
    assert.equal(g.vaga_id, vaga.id);
    assert.equal(g.kit.id, "staff_engineer");
  });

  it("400 para JSON quebrado, vaga inválida e plano de outra vaga", async () => {
    assert.equal((await criar(req("/api/avaliacoes", "POST", "{quebrado"))).status, 400);
    assert.equal((await criar(req("/api/avaliacoes", "POST", { vaga: { id: "x" } }))).status, 400);
    const plano = {
      jobPostingId: "outra",
      stages: [{ tool: "whiteboard", minutes: 30, challenge: { title: "t", brief: "b" }, rationale: "r" }],
      focusPoints: [{ topic: "t", evidenceFromPosting: "e", weight: 1 }],
      outOfScope: [],
      summary: "s",
    };
    assert.equal((await criar(req("/api/avaliacoes", "POST", { vaga, plano }))).status, 400);
  });

  it("502 com detalhes quando o modelo só devolve kits inválidos", async () => {
    const ruim = kitFalso();
    ruim.problemas[0].ficha = [];
    definirContextoParaTestes({ repositorio: criarRepositorioEmMemoria(), llm: criarClienteFalso([ruim]) });
    const r = await criar(req("/api/avaliacoes", "POST", { vaga }));
    assert.equal(r.status, 502);
    assert.ok(Array.isArray((await r.json()).detalhes));
  });

  it("503 sem LLM", async () => {
    definirContextoParaTestes({ repositorio: criarRepositorioEmMemoria(), llm: null });
    assert.equal((await criar(req("/api/avaliacoes", "POST", { vaga }))).status, 503);
  });

  it("rate limit: 6ª geração no minuto devolve 429", async () => {
    const h = { "x-api-key": SEGREDO, "x-real-ip": "9.9.9.9" };
    for (let i = 0; i < 5; i++) assert.equal((await criar(req("/api/avaliacoes", "POST", { vaga }, h))).status, 201);
    assert.equal((await criar(req("/api/avaliacoes", "POST", { vaga }, h))).status, 429);
  });
});

describe("GET/PUT/aprovar", () => {
  it("404 para id desconhecido ou malformado", async () => {
    assert.equal((await obter(req("/x", "GET"), params("av_00000000-0000-0000-0000-000000000000"))).status, 404);
    assert.equal((await obter(req("/x", "GET"), params("../../etc"))).status, 404);
    assert.equal((await aprovar(req("/x", "POST"), params("demo"))).status, 404);
    assert.equal((await substituir(req("/x", "PUT", {}), params("demo"))).status, 404);
  });

  it("PUT valida (400), troca o kit mantendo os ids do servidor e remove a aprovação", async () => {
    const id = await gerar();
    await aprovar(req("/x", "POST"), params(id));
    const atual = (await (await obter(req("/x", "GET"), params(id))).json()).kit;

    const ruim = structuredClone(atual);
    ruim.criterios = ruim.criterios.slice(0, 2);
    const r400 = await substituir(req("/x", "PUT", ruim), params(id));
    assert.equal(r400.status, 400);
    assert.ok(Array.isArray((await r400.json()).detalhes));

    const editado = structuredClone(atual);
    editado.persona = "engenheira staff de sistemas distribuídos, editada pelo gestor";
    editado.id = "tentativa_de_trocar";
    editado.problemas[0].id = "outro_id";
    const ok = await substituir(req("/x", "PUT", { kit: editado }), params(id));
    assert.equal(ok.status, 200);
    const c = await ok.json();
    assert.equal(c.kit.persona, "engenheira staff de sistemas distribuídos, editada pelo gestor");
    assert.equal(c.kit.id, atual.id);
    assert.equal(c.kit.problemas[0].id, atual.problemas[0].id);
    assert.equal(c.aprovado, false);
  });

  it("aprovar marca aprovado", async () => {
    const id = await gerar();
    const r = await aprovar(req("/x", "POST"), params(id));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { avaliacao_id: id, aprovado: true });
    assert.equal((await (await obter(req("/x", "GET"), params(id))).json()).aprovado, true);
  });
});

describe("POST /api/sessoes com avaliação gerada", () => {
  const sessao = (avaliacao_id: string) =>
    criarSessao(new Request("http://x/api/sessoes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ avaliacao_id, candidato_id: "c1" }) }));

  it("403 enquanto não aprovada; 200 depois, só com dados públicos", async () => {
    const id = await gerar();
    const bloqueada = await sessao(id);
    assert.equal(bloqueada.status, 403);

    await aprovar(req("/x", "POST"), params(id));
    const ok = await sessao(id);
    assert.equal(ok.status, 200);
    const c = await ok.json();
    assert.deepEqual(Object.keys(c.problema).sort(), ["enunciado", "titulo"]);
    assert.match(c.area, /Staff/);
    // nada da ficha vaza
    assert.doesNotMatch(JSON.stringify(c), /Resposta oficial/);
  });

  it("AGENTE_PERMITIR_NAO_APROVADA=1 libera a sessão sem aprovação", async () => {
    const id = await gerar();
    process.env.AGENTE_PERMITIR_NAO_APROVADA = "1";
    assert.equal((await sessao(id)).status, 200);
  });

  it("as demos estáticas continuam abertas sem aprovação", async () => {
    assert.equal((await sessao("demo")).status, 200);
  });
});
