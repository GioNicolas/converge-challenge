import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JOB_POSTINGS } from "../../../hiring/mocks/job-postings";
import { ErroLlm, criarClienteFalso } from "../../llm/cliente";
import { kitFalso } from "../falso";
import { ErroGeracaoKit, MODELO_FINAL_PADRAO, gerarKit, gerarKitDetalhado } from "../gerar";

const vaga = JOB_POSTINGS.find((v) => v.id === "staff-engineer")!;

/** Kit "do modelo": ids maliciosos de propósito, para provar que o servidor os troca. */
const kitDoModelo = () => ({ ...kitFalso(vaga.title), id: "../../admin", problemas: [{ ...kitFalso().problemas[0], id: "__proto__" }] });
const kitRuim = () => {
  const k = kitDoModelo();
  k.problemas[0].ficha = k.problemas[0].ficha.slice(0, 3);
  return k;
};

describe("gerarKit", () => {
  it("caminho feliz: uma chamada, raciocínio ligado, timeout longo, ids do servidor", async () => {
    const llm = criarClienteFalso([kitDoModelo()]);
    const kit = await gerarKit({ llm, vaga });
    assert.equal(llm.chamadas.length, 1);
    const c = llm.chamadas[0];
    assert.equal(c.raciocinio, true);
    assert.ok((c.maxTokens ?? 0) >= 12000);
    assert.ok((c.timeoutMs ?? 0) >= 60_000);
    assert.equal(c.modelo, MODELO_FINAL_PADRAO);
    assert.equal(kit.id, "staff_engineer");
    assert.equal(kit.problemas[0].id, "staff_engineer_p1");
    assert.equal(kit.criterios.length, 6);
  });

  it("a vaga e o plano vão como dados na mensagem; o plano é honrado", async () => {
    const llm = criarClienteFalso([kitDoModelo()]);
    const plano = {
      jobPostingId: vaga.id,
      stages: [{ tool: "whiteboard" as const, minutes: 30, challenge: { title: "Monólito", brief: "Fronteiras entre serviços" }, rationale: "r" }],
      focusPoints: [{ topic: "fronteiras entre serviços", evidenceFromPosting: "contratos", weight: 1 }],
      outOfScope: ["custo detalhado de infraestrutura"],
      summary: "s",
    };
    await gerarKit({ llm, vaga, plano });
    const msg = llm.chamadas[0].mensagens[0].content;
    assert.match(msg, /Engenheiro\(a\) Staff de Sistemas Distribuídos/);
    assert.match(msg, /fronteiras entre serviços/);
    assert.match(msg, /custo detalhado de infraestrutura/);
  });

  it("respeita AGENTE_MODELO_FINAL e o parâmetro modelo", async () => {
    const llm = criarClienteFalso([kitDoModelo()]);
    await gerarKit({ llm, vaga, modelo: "anthropic/claude-sonnet-5.5" });
    assert.equal(llm.chamadas[0].modelo, "anthropic/claude-sonnet-5.5");
  });

  it("retry: inválido na 1ª, válido na 2ª, com os erros devolvidos ao modelo", async () => {
    const llm = criarClienteFalso([kitRuim(), kitDoModelo()]);
    const r = await gerarKitDetalhado({ llm, vaga });
    assert.equal(llm.chamadas.length, 2);
    assert.equal(r.tentativas, 2);
    assert.ok(r.errosPrimeiraTentativa.some((e) => e.includes("ficha")));
    const msgs = llm.chamadas[1].mensagens;
    assert.equal(msgs[msgs.length - 1].role, "user");
    assert.match(msgs[msgs.length - 1].content, /ficha com 3 linhas/);
    assert.equal(msgs[msgs.length - 2].role, "assistant");
  });

  it("retry também quando a saída vem fora do schema", async () => {
    const llm = criarClienteFalso([{ lixo: true }, kitDoModelo()]);
    const r = await gerarKitDetalhado({ llm, vaga });
    assert.equal(r.tentativas, 2);
  });

  it("falha final tipada depois de 2 tentativas inválidas", async () => {
    const llm = criarClienteFalso([kitRuim(), kitRuim()]);
    await assert.rejects(gerarKit({ llm, vaga }), (e) => {
      assert.ok(e instanceof ErroGeracaoKit);
      assert.equal(e.codigo, "invalido");
      assert.ok(e.erros.length > 0);
      return true;
    });
    assert.equal(llm.chamadas.length, 2);
  });

  it("erro de transporte vira ErroGeracaoKit 'llm', sem retry", async () => {
    const llm = criarClienteFalso([new ErroLlm("timeout", "demorou")]);
    await assert.rejects(gerarKit({ llm, vaga }), (e) => e instanceof ErroGeracaoKit && e.codigo === "llm");
    assert.equal(llm.chamadas.length, 1);
  });

  it("fallback documentado: 404 do modelo padrão tenta o sonnet", async () => {
    const antes = process.env.AGENTE_MODELO_FINAL;
    delete process.env.AGENTE_MODELO_FINAL;
    try {
      const llm = criarClienteFalso([new ErroLlm("http", "HTTP 404", 404), kitDoModelo()]);
      const r = await gerarKitDetalhado({ llm, vaga });
      assert.equal(r.modelo, "anthropic/claude-sonnet-5.5");
      assert.equal(llm.chamadas.length, 2);
    } finally {
      if (antes !== undefined) process.env.AGENTE_MODELO_FINAL = antes;
    }
  });

  it("funciona para todas as vagas mock (ids seguros)", async () => {
    for (const v of JOB_POSTINGS) {
      const kit = await gerarKit({ llm: criarClienteFalso([kitDoModelo()]), vaga: v });
      assert.match(kit.id, /^[a-z][a-z0-9_]+$/);
    }
  });
});
