import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { montarSistemaEstaticoPerguntar } from "../../prompts/entrevistador";
import { montarSistemaDinamico, montarSistemaEstatico, montarPromptAvaliador } from "../../prompts/avaliador";
import { SISTEMA_GERADOR_KIT } from "../../prompts/gerador-kit";
import { estadoInicial } from "../../sessao/estado";
import { kitFalso } from "../falso";
import { resolverAvaliacao } from "../index";
import { criarRepositorioAvaliacoesEmMemoria, definirRepositorioAvaliacoesParaTestes, repositorioAvaliacoesPadrao } from "../repositorio";
import type { Kit } from "../tipos";

afterEach(() => definirRepositorioAvaliacoesParaTestes(null));

const kitObra = (): Kit => {
  const k = kitFalso("coordenação de obras");
  return { ...k, id: "obra_x", problemas: [{ ...k.problemas[0], id: "obra_x_p1" }] };
};

describe("RepositorioAvaliacoes", () => {
  it("criar nasce não aprovada; aprovar; substituir remove a aprovação; devolve cópias", async () => {
    const repo = criarRepositorioAvaliacoesEmMemoria();
    const kit = kitObra();
    const r = await repo.criar({ avaliacaoId: "av_1", kit, problema: kit.problemas[0], vagaId: "coordenador-obras" });
    assert.equal(r.aprovado, false);
    assert.ok(r.criadoEm > 0);
    assert.equal((await repo.aprovar("av_1"))?.aprovado, true);
    assert.equal((await repo.obter("av_1"))?.aprovado, true);

    const outro = { ...kit, area: "outra" };
    const s = await repo.substituirKit("av_1", outro, outro.problemas[0]);
    assert.equal(s?.kit.area, "outra");
    assert.equal(s?.aprovado, false);

    const lido = (await repo.obter("av_1"))!;
    lido.kit.area = "mutado fora";
    assert.equal((await repo.obter("av_1"))?.kit.area, "outra");

    assert.equal(await repo.obter("nao"), undefined);
    assert.equal(await repo.aprovar("nao"), undefined);
    assert.equal(await repo.substituirKit("nao", kit, kit.problemas[0]), undefined);
  });

  it("o singleton em globalThis é compartilhado", () => {
    assert.equal(repositorioAvaliacoesPadrao(), repositorioAvaliacoesPadrao());
  });
});

describe("resolverAvaliacao (dinâmicas primeiro, depois demos)", () => {
  it("acha a dinâmica, com aprovação, e continua achando as demos", async () => {
    const kit = kitObra();
    await repositorioAvaliacoesPadrao().criar({ avaliacaoId: "av_dyn", kit, problema: kit.problemas[0], vagaId: "v" });
    const dyn = await resolverAvaliacao("av_dyn");
    assert.equal(dyn?.dinamica, true);
    assert.equal(dyn?.aprovado, false);
    const demo = await resolverAvaliacao("demo");
    assert.equal(demo?.dinamica, false);
    assert.equal(demo?.aprovado, true);
    assert.equal(await resolverAvaliacao("nada"), undefined);
  });

  it("uma dinâmica com o id de uma demo tem precedência", async () => {
    const kit = kitObra();
    await repositorioAvaliacoesPadrao().criar({ avaliacaoId: "demo", kit, problema: kit.problemas[0], vagaId: "v" });
    assert.equal((await resolverAvaliacao("demo"))?.kit.id, "obra_x");
  });
});

// Vocabulário que só faz sentido para software. O prompt estático montado a partir de um kit
// não-tech não pode conter nada disso (o texto do kit é do kit; aqui ele não tem esses termos).
const TERMOS_TECH = /postgres|banco de dados|excalidraw|\bapi\b|servidor|microsservi|lat[êe]ncia|throughput|\bcache\b|kubernetes|\bsql\b|escalabilidade|reposit[óo]rio/i;

describe("auditoria de prompts: sem boilerplate de tecnologia", () => {
  const kit = kitObra();
  const problema = kit.problemas[0];

  it("kit de fixture realmente não tem termos tech", () => {
    assert.doesNotMatch(JSON.stringify(kit), TERMOS_TECH);
  });

  it("prompt estático do avaliador", () => {
    assert.doesNotMatch(montarSistemaEstatico(kit, problema), TERMOS_TECH);
  });

  it("prompt estático do /perguntar", () => {
    assert.doesNotMatch(montarSistemaEstaticoPerguntar(kit, problema), TERMOS_TECH);
  });

  it("prompt dinâmico (sem o grafo do candidato)", () => {
    const estado = estadoInicial({ criterios: kit.criterios.map((c) => c.id) });
    const p = montarPromptAvaliador(kit, problema, estado, {
      sessao_id: "s", fase: "APROFUNDAMENTO", grafo: "COMPONENTES\n- [r1] Fundação (retângulo)", mudancas: "", conversa_recente: [], perguntas_feitas: 0, imagem_url: null,
    }, Date.now());
    assert.doesNotMatch(p.sistema.dinamico, TERMOS_TECH);
    assert.doesNotMatch(montarSistemaDinamico(estado, { sessao_id: "s", fase: "APROFUNDAMENTO", grafo: "x", mudancas: "", conversa_recente: [], perguntas_feitas: 0, imagem_url: null }, Date.now()), TERMOS_TECH);
  });

  it("o prompt usa os campos do kit (persona, área, modo de leitura)", () => {
    const s = montarSistemaEstatico({ ...kit, persona: "engenheira civil sênior de obras residenciais", modoLeitura: "visual" }, problema);
    assert.match(s, /engenheira civil sênior de obras residenciais/);
    assert.match(s, /modo de leitura: visual/);
  });

  it("o prompt do GERADOR manda não assumir tecnologia e cobre várias áreas", () => {
    for (const t of ["construção civil", "produto", "dados", "marketing", "operações", "saúde", "NÃO ASSUMA TECNOLOGIA", "modoLeitura", "VAGO DE PROPÓSITO", "500 caracteres"]) {
      assert.ok(SISTEMA_GERADOR_KIT.includes(t) || SISTEMA_GERADOR_KIT.toLowerCase().includes(t.toLowerCase()), t);
    }
  });
});
