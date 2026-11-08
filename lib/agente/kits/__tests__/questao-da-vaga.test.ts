import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InterviewConfig } from "@/lib/contracts";
import { criarKvEmMemoria } from "@/lib/storage/kv";
import { criarClienteFalso, type ClienteFalso } from "../../llm/cliente";
import { kitFalso } from "../falso";
import { KIT_SYSTEM_DESIGN } from "../system-design";
import { avaliacaoDaConfig, avaliacaoGeradaDaConfig, garantirQuestaoDaVaga, gerarQuestaoDaVaga } from "../questao-da-vaga";
import { criarRepositorioAvaliacoesEmMemoria } from "../repositorio";

const configDe = (extra: Partial<InterviewConfig> = {}): InterviewConfig =>
  InterviewConfig.parse({
    id: "cfg-logistica",
    mode: "system_design",
    roleTitle: "Engenheiro(a) Backend Sênior · Logística",
    jobDescription: "Roteirização de entregas de última milha para 2 mil motoristas, rastreio em tempo real e reentrega.",
    seniority: "senior",
    focus: [{ area: "escala_produto", weight: 0.7 }, { area: "pressao", weight: 0.3 }],
    recruiterNotes: "Quero ver como ele trata motorista sem sinal.",
    criteria: [{ id: "c1", name: "Falhas", description: "Pensa no que acontece quando o motorista perde o sinal", weight: 1, focus: "escala_produto" }],
    problemId: "encurtador-de-url",
    languages: ["python"],
    durationMin: 45,
    ...extra,
  });

/** O que o modelo devolve: só o problema, sem id. */
const problemaDoModelo = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, empecilho, ...p } = kitFalso("Logística").problemas[0] as ReturnType<typeof kitFalso>["problemas"][0] & { empecilho?: unknown };
  return { ...p, titulo: "Roteirização de entregas" };
};

/** O cliente falso com um atraso, para a geração ainda estar rodando quando o candidato chega. */
function comAtraso(llm: ClienteFalso, ms: number): ClienteFalso {
  return {
    chamadas: llm.chamadas,
    async completarJson(args) {
      await new Promise((r) => setTimeout(r, ms));
      return llm.completarJson(args);
    },
  };
}

describe("questão do quadro gerada para a vaga", () => {
  it("gera, aprova e entra no kit fixo do formato (rubrica do quadro, problema novo)", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const llm = criarClienteFalso([problemaDoModelo()]);
    const config = configDe();

    const id = await gerarQuestaoDaVaga(config, { llm, repositorio });

    assert.equal(id, avaliacaoGeradaDaConfig(config.id));
    const r = await repositorio.obter(id!);
    assert.ok(r?.aprovado);
    assert.equal(r.problema.titulo, "Roteirização de entregas");
    assert.equal(r.kit.problemas.length, 1);
    assert.equal(r.problema.id, r.kit.problemas[0].id);
    assert.equal(llm.chamadas[0].nomeSchema, "problema_quadro");
    assert.deepEqual(r.kit.criterios, KIT_SYSTEM_DESIGN.criterios);
    assert.equal(r.kit.persona, KIT_SYSTEM_DESIGN.persona);
    assert.equal(r.problema.empecilho, undefined);
  });

  it("a vaga e o que a recrutadora combinou vão na mensagem ao gerador", async () => {
    const llm = criarClienteFalso([problemaDoModelo()]);
    await gerarQuestaoDaVaga(configDe(), { llm, repositorio: criarRepositorioAvaliacoesEmMemoria() });
    const msg = llm.chamadas[0].mensagens[0].content;
    assert.match(msg, /última milha/);
    assert.match(msg, /motorista sem sinal/);
    assert.match(msg, /system design de SOFTWARE/);
    assert.match(msg, /escala, trade-offs e evolução do produto \(70%\)/);
  });

  it("live coding e config sem descrição da vaga não geram", async () => {
    const llm = criarClienteFalso([]);
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    assert.equal(await gerarQuestaoDaVaga(configDe({ mode: "live_coding" }), { llm, repositorio }), undefined);
    assert.equal(await gerarQuestaoDaVaga(configDe({ jobDescription: undefined }), { llm, repositorio }), undefined);
    assert.equal(llm.chamadas.length, 0);
  });

  it("a sessão usa a questão gerada; sem ela (ou sem aprovação), o problema fixo do catálogo", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const config = configDe();
    assert.equal(await avaliacaoDaConfig(config, { repositorio }), "demo");

    await repositorio.criar({ avaliacaoId: avaliacaoGeradaDaConfig(config.id), kit: KIT_SYSTEM_DESIGN, problema: KIT_SYSTEM_DESIGN.problemas[0], vagaId: config.id });
    assert.equal(await avaliacaoDaConfig(config, { repositorio }), "demo");

    await repositorio.aprovar(avaliacaoGeradaDaConfig(config.id));
    assert.equal(await avaliacaoDaConfig(config, { repositorio }), avaliacaoGeradaDaConfig(config.id));
  });

  it("candidato que entra antes da questão ficar pronta espera por ela (não cai no encurtador)", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const kv = criarKvEmMemoria();
    const config = configDe({ id: "cfg-corrida" });
    const llm = comAtraso(criarClienteFalso([problemaDoModelo()]), 50);

    // A recrutadora fecha o plano: a geração começa em segundo plano.
    const fundo = garantirQuestaoDaVaga(config, { llm, repositorio, kv }, { esperarMs: 5000 });
    // O candidato entra logo em seguida: espera a mesma geração, sem disparar outra.
    const id = await avaliacaoDaConfig(config, { llm, repositorio, kv, esperarMs: 5000 });

    assert.equal(id, avaliacaoGeradaDaConfig(config.id));
    assert.equal(await fundo, id);
    assert.equal(llm.chamadas.length, 1, "uma geração só");
    assert.equal((await repositorio.obter(id!))?.problema.titulo, "Roteirização de entregas");
  });

  it("vaga sem questão (antiga ou geração morta): a sessão gera na hora", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const config = configDe({ id: "cfg-antiga" });
    const llm = criarClienteFalso([problemaDoModelo()]);
    const id = await avaliacaoDaConfig(config, { llm, repositorio, kv: criarKvEmMemoria(), esperarMs: 5000 });
    assert.equal(id, avaliacaoGeradaDaConfig(config.id));
  });

  it("problema recusado pelo validador: corrige uma vez; falhou de novo, cai no problema fixo", async () => {
    const config = configDe({ id: "cfg-ruim" });
    const ruim = { ...problemaDoModelo(), ficha: [] };
    const llm = criarClienteFalso([ruim, problemaDoModelo()]);
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    assert.equal(await gerarQuestaoDaVaga(config, { llm, repositorio }), avaliacaoGeradaDaConfig(config.id));
    assert.match(llm.chamadas[1].mensagens.at(-1)!.content, /ficha com 0 linhas/);

    const sempreRuim = criarClienteFalso([ruim, ruim]);
    const id = await avaliacaoDaConfig(configDe({ id: "cfg-pior" }), {
      llm: sempreRuim,
      repositorio,
      kv: criarKvEmMemoria(),
      esperarMs: 5000,
    });
    assert.equal(id, "demo");
  });
});
