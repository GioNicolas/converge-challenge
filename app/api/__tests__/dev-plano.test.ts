// Testes das rotas de desenvolvimento /api/dev/*. Sem rede, LLM falso (o mesmo do AGENTE_FAKE=1).
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { criarRepositorioEmMemoria } from "../../../lib/agente/armazenamento";
import { criarRepositorioAvaliacoesEmMemoria, definirRepositorioAvaliacoesParaTestes, repositorioAvaliacoesPadrao } from "../../../lib/agente/kits/repositorio";
import { definirContextoParaTestes } from "../../../lib/agente/rotas/contexto";
import { limitadorDevAprovar, limitadorDevPlano } from "../../../lib/agente/rotas/dev-plano";
import { criarLlmFalsoDeterministico } from "../../../lib/agente/rotas/llm-falso";
import { limitadorCriacao } from "../../../lib/agente/rotas/handlers";
import { vagaDeExemplo } from "../../../lib/agente/planejamento/vaga-exemplo";
import { GET as estado } from "../dev/estado/route";
import { POST as plano } from "../dev/plano/route";
import { POST as aprovar } from "../dev/plano/aprovar/route";
import { POST as criarSessao } from "../sessoes/route";

const env = process.env as Record<string, string | undefined>;
const guardados: Record<string, string | undefined> = {};
const CHAVES = ["NODE_ENV", "AGENTE_DEV", "AGENTE_FAKE", "OPENROUTER_API_KEY", "AGENTE_PERMITIR_NAO_APROVADA"];

const post = (url: string, corpo: unknown) =>
  new Request("http://x" + url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });

beforeEach(() => {
  for (const k of CHAVES) guardados[k] = env[k];
  env.NODE_ENV = "development";
  delete env.AGENTE_DEV;
  delete env.AGENTE_PERMITIR_NAO_APROVADA;
  definirRepositorioAvaliacoesParaTestes(criarRepositorioAvaliacoesEmMemoria());
  limitadorDevPlano.reiniciar();
  limitadorDevAprovar.reiniciar();
  limitadorCriacao.reiniciar();
  definirContextoParaTestes({ repositorio: criarRepositorioEmMemoria(), llm: criarLlmFalsoDeterministico(), agora: () => 1_000_000 });
});
afterEach(() => {
  for (const k of CHAVES) {
    if (guardados[k] === undefined) delete env[k];
    else env[k] = guardados[k];
  }
  definirContextoParaTestes(null);
  definirRepositorioAvaliacoesParaTestes(null);
});

const { texto } = vagaDeExemplo(6);

describe("rotas /api/dev", () => {
  it("404 em produção, sem AGENTE_DEV", async () => {
    env.NODE_ENV = "production";
    assert.equal((await plano(post("/api/dev/plano", { descricao: texto, historico: [] }))).status, 404);
    assert.equal((await aprovar(post("/api/dev/plano/aprovar", {}))).status, 404);
    assert.equal((await estado()).status, 404);
  });

  it("AGENTE_DEV=1 reabilita em produção", async () => {
    env.NODE_ENV = "production";
    env.AGENTE_DEV = "1";
    assert.equal((await estado()).status, 200);
  });

  it("estado: não vaza a chave", async () => {
    env.AGENTE_FAKE = "1";
    env.OPENROUTER_API_KEY = "sk-segredo-xyz";
    const r = await estado();
    const corpo = await r.text();
    assert.ok(!corpo.includes("sk-segredo-xyz"));
    const d = JSON.parse(corpo);
    assert.equal(d.fake, true);
    assert.equal(d.temChave, true);
    assert.equal(d.modeloPlanejamento, "anthropic/claude-sonnet-5.5");
    assert.ok(d.modeloFinal);
  });

  it("validação: 400 para corpo inválido, 413 para grande demais", async () => {
    assert.equal((await plano(post("/api/dev/plano", "não é json"))).status, 400);
    assert.equal((await plano(post("/api/dev/plano", { descricao: "", historico: [] }))).status, 400);
    assert.equal((await plano(post("/api/dev/plano", { descricao: "x", historico: [{ quem: "robo", texto: "oi" }] }))).status, 400);
    assert.equal((await plano(post("/api/dev/plano", { descricao: "x".repeat(300_000), historico: [] }))).status, 413);
    assert.equal((await aprovar(post("/api/dev/plano/aprovar", { vaga: {}, plano: {} }))).status, 400);
  });

  it("503 sem LLM", async () => {
    definirContextoParaTestes({ llm: null });
    assert.equal((await plano(post("/api/dev/plano", { descricao: texto, historico: [] }))).status, 503);
  });

  it("limite por IP na conversa", async () => {
    let ultimo = 200;
    for (let i = 0; i < 31; i++) ultimo = (await plano(post("/api/dev/plano", { descricao: texto, historico: [] }))).status;
    assert.equal(ultimo, 429);
  });

  it("conversa -> plano -> aprovar guarda avaliação APROVADA e a sessão pode ser criada", async () => {
    // 1º turno: pergunta
    let r = await plano(post("/api/dev/plano", { descricao: texto, historico: [] }));
    assert.equal(r.status, 200);
    let d = await r.json();
    assert.equal(d.plano, null);
    assert.ok(d.vaga.id);
    // 2º turno: plano
    const historico = [{ quem: "agente", texto: d.mensagem }, { quem: "usuario", texto: "Faça você" }];
    r = await plano(post("/api/dev/plano", { descricao: texto, historico, vaga: d.vaga }));
    d = await r.json();
    assert.ok(d.plano);
    assert.equal(d.plano.jobPostingId, d.vaga.id);
    assert.equal(d.pronto, true);

    const ap = await aprovar(post("/api/dev/plano/aprovar", { vaga: d.vaga, plano: d.plano }));
    assert.equal(ap.status, 201);
    const a = await ap.json();
    assert.match(a.avaliacao_id, /^av_/);
    assert.ok(a.resumo.area && a.resumo.persona && a.resumo.titulo);
    assert.ok(a.resumo.criterios.length >= 6);

    const reg = await repositorioAvaliacoesPadrao().obter(a.avaliacao_id);
    assert.equal(reg?.aprovado, true);

    const s = await criarSessao(post("/api/sessoes", { avaliacao_id: a.avaliacao_id, candidato_id: "c1" }));
    assert.equal(s.status, 200);
    assert.ok((await s.json()).sessao_id);
  });

  it("aprovar: plano de outra vaga -> 400", async () => {
    const r = await plano(post("/api/dev/plano", { descricao: texto, historico: [{ quem: "usuario", texto: "vai" }] }));
    const d = await r.json();
    const ap = await aprovar(post("/api/dev/plano/aprovar", { vaga: { ...d.vaga, id: "outra" }, plano: d.plano }));
    assert.equal(ap.status, 400);
  });
});
