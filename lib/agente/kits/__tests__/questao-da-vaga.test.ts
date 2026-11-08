import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InterviewConfig } from "@/lib/contracts";
import { criarClienteFalso } from "../../llm/cliente";
import { kitFalso } from "../falso";
import { KIT_SYSTEM_DESIGN } from "../system-design";
import { avaliacaoDaConfig, avaliacaoGeradaDaConfig, gerarQuestaoDaVaga } from "../questao-da-vaga";
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

const kitDoModelo = () => {
  const k = kitFalso("Logística");
  return { ...k, problemas: [{ ...k.problemas[0], titulo: "Roteirização de entregas" }] };
};

describe("questão do quadro gerada para a vaga", () => {
  it("gera, aprova e entra no kit fixo do formato (rubrica do quadro, problema novo)", async () => {
    const repositorio = criarRepositorioAvaliacoesEmMemoria();
    const llm = criarClienteFalso([kitDoModelo()]);
    const config = configDe();

    const id = await gerarQuestaoDaVaga(config, { llm, repositorio });

    assert.equal(id, avaliacaoGeradaDaConfig(config.id));
    const r = await repositorio.obter(id!);
    assert.ok(r?.aprovado);
    assert.equal(r.problema.titulo, "Roteirização de entregas");
    assert.equal(r.kit.problemas.length, 1);
    assert.deepEqual(r.kit.criterios, KIT_SYSTEM_DESIGN.criterios);
    assert.equal(r.kit.persona, KIT_SYSTEM_DESIGN.persona);
    assert.equal(r.problema.empecilho, undefined);
  });

  it("a vaga e o que a recrutadora combinou vão na mensagem ao gerador", async () => {
    const llm = criarClienteFalso([kitDoModelo()]);
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
    assert.equal(await avaliacaoDaConfig(config, repositorio), "demo");

    await repositorio.criar({ avaliacaoId: avaliacaoGeradaDaConfig(config.id), kit: KIT_SYSTEM_DESIGN, problema: KIT_SYSTEM_DESIGN.problemas[0], vagaId: config.id });
    assert.equal(await avaliacaoDaConfig(config, repositorio), "demo");

    await repositorio.aprovar(avaliacaoGeradaDaConfig(config.id));
    assert.equal(await avaliacaoDaConfig(config, repositorio), avaliacaoGeradaDaConfig(config.id));
  });
});
