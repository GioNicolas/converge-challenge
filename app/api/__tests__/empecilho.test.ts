// Mudança no problema (empecilho) no quadro: a rota confere a hora, entrega o texto pronto do kit,
// guarda no estado e registra na linha do tempo. Sem rede e sem LLM real.
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { criarRepositorioEmMemoria, type RepositorioSessoes } from "../../../lib/agente/armazenamento";
import { criarRepositorioAvaliacoesEmMemoria } from "../../../lib/agente/kits/repositorio";
import { definirRepositorioAvaliacoesParaTestes } from "../../../lib/agente/kits/repositorio";
import { EMPECILHOS_GENERICOS } from "../../../lib/agente/kits/empecilhos-genericos";
import { KIT_SYSTEM_DESIGN } from "../../../lib/agente/kits/system-design";
import { definirContextoParaTestes } from "../../../lib/agente/rotas/contexto";
import { limitadorCriacao } from "../../../lib/agente/rotas/handlers";
import { criarLlmFalsoDeterministico } from "../../../lib/agente/rotas/llm-falso";
import { POST as criar } from "../sessoes/route";
import { POST as empecilhoPost } from "../sessoes/[id]/empecilho/route";
import { POST as eventosPost } from "../sessoes/[id]/eventos/route";
import { POST as perguntarPost } from "../sessoes/[id]/perguntar/route";

const GRAFO = "COMPONENTES\n- [r1] Cliente (retângulo)\n- [r2] Serviço (retângulo)\n- [e1] Banco (elipse)\nCONEXÕES\n- [s1] Cliente → Serviço\n- [s2] Serviço → Banco";
const ENCURTADOR = KIT_SYSTEM_DESIGN.problemas[0].empecilho!;

let repo: RepositorioSessoes;
let relogio = 1_000_000;

function post(url: string, corpo: unknown): Request {
  return new Request("http://x" + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function novaSessao(avaliacao = "demo"): Promise<string> {
  const r = await criar(post("/api/sessoes", { avaliacao_id: avaliacao, candidato_id: "c1" }));
  assert.equal(r.status, 200);
  return (await r.json()).sessao_id;
}

async function irParaFase(id: string, fase: string) {
  const r = await eventosPost(post(`/api/sessoes/${id}/eventos`, { eventos: [{ horario: new Date(relogio).toISOString(), tipo: "fase", dados: { fase } }] }), params(id));
  assert.equal(r.status, 200);
}

async function pedir(id: string, corpo: Record<string, unknown> = {}) {
  const r = await empecilhoPost(post(`/api/sessoes/${id}/empecilho`, { sessao_id: id, fase: "ALTO_NIVEL", grafo: GRAFO, ...corpo }), params(id));
  return { status: r.status, corpo: await r.json() };
}

beforeEach(() => {
  repo = criarRepositorioEmMemoria();
  relogio = 1_000_000;
  limitadorCriacao.reiniciar();
  definirContextoParaTestes({ repositorio: repo, llm: criarLlmFalsoDeterministico(), agora: () => relogio });
});
afterEach(() => definirContextoParaTestes(null));

describe("POST /api/sessoes/[id]/empecilho", () => {
  it("espera o meio da entrevista e, na hora, entrega o texto do kit, guarda no estado e registra na linha do tempo", async () => {
    const id = await novaSessao();
    await irParaFase(id, "ALTO_NIVEL");
    assert.deepEqual((await pedir(id)).corpo, { empecilho: null, motivo: "cedo" });

    relogio += 300_000; // metade da visão geral (600 s)
    const { status, corpo } = await pedir(id);
    assert.equal(status, 200);
    assert.deepEqual(corpo, { empecilho: { fala: ENCURTADOR.fala, requisito: ENCURTADOR.requisito }, motivo: null });
    assert.ok(corpo.empecilho.fala.trim().endsWith("?"), "a fala deixa a bola com o candidato");

    const sessao = await repo.obter(id);
    assert.equal(sessao?.estado.empecilho?.id, ENCURTADOR.id);
    assert.equal(sessao?.estado.empecilho?.anunciadoEm, relogio);
    assert.equal(sessao?.estado.conversa.at(-1)?.texto, ENCURTADOR.fala);
    const eventos = await repo.listarEventos(id);
    const evento = eventos.find((e) => e.tipo === "empecilho");
    assert.ok(evento, "evento na linha do tempo");
    assert.equal((evento.dados as { requisito: string }).requisito, ENCURTADOR.requisito);

    // Uma por sessão.
    relogio += 60_000;
    assert.deepEqual((await pedir(id)).corpo, { empecilho: null, motivo: "já anunciado" });
  });

  it("não entra no começo, no fim, sem desenho, logo depois de o Totti falar nem com pergunta no ar", async () => {
    const id = await novaSessao();
    assert.equal((await pedir(id, { fase: "REQUISITOS" })).corpo.motivo, "fora do meio da entrevista");
    await irParaFase(id, "ALTO_NIVEL");
    relogio += 300_000;
    assert.equal((await pedir(id, { grafo: "COMPONENTES\n- [r1] Cliente (retângulo)" })).corpo.motivo, "pouco desenho para adaptar");

    const fala = await perguntarPost(post(`/api/sessoes/${id}/perguntar`, { sessao_id: id, fase: "ALTO_NIVEL", texto: "Quantas URLs novas por mês?" }), params(id));
    assert.equal(fala.status, 200);
    if ((await fala.json()).responder) {
      assert.equal((await pedir(id)).corpo.motivo, "respiro depois da última fala");
      relogio += 20_000;
    }
    assert.ok((await pedir(id)).corpo.empecilho, "depois do respiro sai");
  });

  it("no aprofundamento só enquanto sobra tempo para adaptar", async () => {
    const id = await novaSessao();
    await irParaFase(id, "APROFUNDAMENTO");
    // O APROFUNDAMENTO acaba com 85% do tempo total (#129, decisão F): 20 min de 35 deixam 1/3 da janela até lá.
    relogio += 1_200_000;
    assert.equal((await pedir(id, { fase: "APROFUNDAMENTO" })).corpo.motivo, "pouco tempo para adaptar");
  });

  it("forçar (demo) ignora a hora, mas não repete; problema sem mudança prevista não fala nada", async () => {
    const id = await novaSessao();
    await irParaFase(id, "REQUISITOS");
    const forcado = await pedir(id, { fase: "REQUISITOS", grafo: "", forcar: true });
    assert.equal(forcado.corpo.empecilho.requisito, ENCURTADOR.requisito);
    assert.equal((await repo.obter(id))?.estado.empecilho?.forcado, true);
    assert.equal((await pedir(id, { forcar: true })).corpo.motivo, "já anunciado");

    const produto = await novaSessao("demo-produto");
    assert.deepEqual((await pedir(produto, { forcar: true })).corpo, { empecilho: null, motivo: "problema sem mudança prevista" });
  });

  it("forçar não existe em produção", async () => {
    const id = await novaSessao();
    const env = process.env as Record<string, string | undefined>;
    const antes = { node: env.NODE_ENV, dev: env.AGENTE_DEV };
    env.NODE_ENV = "production";
    delete env.AGENTE_DEV;
    try {
      assert.equal((await pedir(id, { forcar: true })).status, 404);
    } finally {
      env.NODE_ENV = antes.node;
      if (antes.dev !== undefined) env.AGENTE_DEV = antes.dev;
    }
  });

  it("os 4 problemas de tecnologia têm uma mudança pronta, curta no quadro e que termina com uma pergunta", async () => {
    for (const avaliacao of ["demo", "demo-chat", "demo-pagamentos", "demo-chatbot-ia"]) {
      const id = await novaSessao(avaliacao);
      const r = await pedir(id, { forcar: true });
      assert.ok(r.corpo.empecilho, avaliacao);
      assert.ok(r.corpo.empecilho.requisito.length <= 50, `${avaliacao}: requisito curto`);
      assert.ok(r.corpo.empecilho.fala.trim().endsWith("?"), `${avaliacao}: termina com pergunta`);
    }
  });
});

describe("mudança genérica quando o problema não tem uma (system design)", () => {
  it("problema de system design sem mudança própria: a genérica pela cobertura do momento", async () => {
    const repoAval = criarRepositorioAvaliacoesEmMemoria();
    definirRepositorioAvaliacoesParaTestes(repoAval);
    try {
      // Sem `empecilho` no problema: a rota tem que escolher uma genérica do kit.
      const { empecilho: _semMudanca, ...semMudanca } = KIT_SYSTEM_DESIGN.problemas[0];
      await repoAval.criar({ avaliacaoId: "questao-sem-mudanca", kit: { ...KIT_SYSTEM_DESIGN, problemas: [semMudanca] }, problema: semMudanca, vagaId: "v1" });
      await repoAval.aprovar("questao-sem-mudanca");

      const id = await novaSessao("questao-sem-mudanca");
      await irParaFase(id, "ALTO_NIVEL");
      relogio += 300_000;
      const { status, corpo } = await pedir(id);
      assert.equal(status, 200);
      // Sem evidência de escalabilidade no começo: volume 10x.
      assert.equal(corpo.empecilho.requisito, EMPECILHOS_GENERICOS.volume.requisito);
      assert.equal((await repo.obter(id))?.estado.empecilho?.id, EMPECILHOS_GENERICOS.volume.id);
    } finally {
      definirRepositorioAvaliacoesParaTestes(null);
    }
  });

  it("kit sem genéricas (design de produto) segue sem mudança prevista", async () => {
    const produto = await novaSessao("demo-produto");
    await irParaFase(produto, "ALTO_NIVEL");
    relogio += 300_000;
    assert.deepEqual((await pedir(produto)).corpo, { empecilho: null, motivo: "problema sem mudança prevista" });
  });
});
