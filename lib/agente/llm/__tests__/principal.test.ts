import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import type { completeJson } from "../../../llm";
import { NOME_SCHEMA_ABERTURA } from "../../prompts/abertura";
import { NOME_SCHEMA_ANALISE } from "../../prompts/avaliador";
import { NOME_SCHEMA_PERGUNTAR } from "../../prompts/entrevistador";
import { NOME_SCHEMA_KIT } from "../../prompts/gerador-kit";
import { NOME_SCHEMA_PLANEJADOR } from "../../prompts/planejador";
import { NOME_SCHEMA_SCORECARD } from "../../prompts/scorecard";
import { ErroLlm } from "../cliente";
import { criarClientePrincipal } from "../principal";

type Chamada = Parameters<typeof completeJson>[0];

const Saida = z.object({ n: z.number() });

/** `completar` falso: registra a chamada e valida o JSON "do modelo" com o schema recebido, como o lib/llm faz. */
function falso(json: unknown, opcoes: { demora?: number; erro?: Error } = {}) {
  const chamadas: Chamada[] = [];
  const completar = (async (c: Chamada) => {
    chamadas.push(c);
    if (opcoes.demora) await new Promise((r) => setTimeout(r, opcoes.demora));
    if (opcoes.erro) throw opcoes.erro;
    const data = c.schema.parse(json);
    return { data, model: "zai-org/GLM-5.3-Flash", provider: "featherless", durationMs: 123, costUsd: 0.002, promptTokens: 10, completionTokens: 5 };
  }) as unknown as typeof completeJson;
  return { chamadas, cliente: criarClientePrincipal({ completar }) };
}

const base = (nomeSchema: string, extra: object = {}) => ({
  sistema: { estatico: "ESTATICO", dinamico: "DINAMICO" },
  mensagens: [{ role: "user" as const, content: "oi" }],
  schema: Saida,
  nomeSchema,
  ...extra,
});

describe("criarClientePrincipal (cérebro do quadro sobre o lib/llm)", () => {
  it("cada chamada do cérebro vai para o papel certo do lib/llm", async () => {
    const esperado: Array<[string, string]> = [
      [NOME_SCHEMA_ANALISE, "analyst"],
      [NOME_SCHEMA_PLANEJADOR, "analyst"],
      [NOME_SCHEMA_PERGUNTAR, "interviewer"],
      [NOME_SCHEMA_ABERTURA, "interviewer"],
      [NOME_SCHEMA_SCORECARD, "evaluator"],
      [NOME_SCHEMA_KIT, "evaluator"],
      ["schema_desconhecido", "evaluator"],
    ];
    for (const [nome, papel] of esperado) {
      const { chamadas, cliente } = falso({ n: 1 });
      await cliente.completarJson(base(nome));
      assert.equal(chamadas[0].role, papel, nome);
    }
  });

  it("junta o prompt estático e o dinâmico e devolve dados, modelo e uso", async () => {
    const { chamadas, cliente } = falso({ n: 7 });
    const r = await cliente.completarJson(base(NOME_SCHEMA_ANALISE));
    assert.equal(chamadas[0].system, "ESTATICO\n\nDINAMICO");
    assert.equal(chamadas[0].user, "oi");
    assert.deepEqual(r.dados, { n: 7 });
    assert.equal(r.modelo, "zai-org/GLM-5.3-Flash");
    assert.equal(r.ms, 123);
    assert.deepEqual(r.uso, { entrada: 10, saida: 5, custo: 0.002 });
  });

  it("sem bloco dinâmico, o sistema é só o estático", async () => {
    const { chamadas, cliente } = falso({ n: 1 });
    await cliente.completarJson(base(NOME_SCHEMA_KIT, { sistema: { estatico: "SO ESTATICO" } }));
    assert.equal(chamadas[0].system, "SO ESTATICO");
  });

  it("várias mensagens viram um texto só, com o autor de cada uma", async () => {
    const { chamadas, cliente } = falso({ n: 1 });
    await cliente.completarJson(
      base(NOME_SCHEMA_KIT, {
        mensagens: [
          { role: "user", content: "a vaga" },
          { role: "assistant", content: "(resposta fora do schema)" },
          { role: "user", content: "corrija" },
        ],
      }),
    );
    assert.match(chamadas[0].user, /Usuário: a vaga/);
    assert.match(chamadas[0].user, /Você \(resposta anterior\): \(resposta fora do schema\)/);
    assert.match(chamadas[0].user, /Usuário: corrija/);
  });

  it("limites de tokens pequenos (do quadro) ficam de fora; os grandes passam", async () => {
    const pequeno = falso({ n: 1 });
    await pequeno.cliente.completarJson(base(NOME_SCHEMA_PERGUNTAR, { maxTokens: 200 }));
    assert.equal(pequeno.chamadas[0].maxTokens, undefined);
    const grande = falso({ n: 1 });
    await grande.cliente.completarJson(base(NOME_SCHEMA_SCORECARD, { maxTokens: 6000 }));
    assert.equal(grande.chamadas[0].maxTokens, 6000);
  });

  it("saída fora do schema vira ErroLlm 'invalido' (os chamadores pedem de novo)", async () => {
    const { cliente } = falso({ n: "não é número" }, {});
    await assert.rejects(
      cliente.completarJson(base(NOME_SCHEMA_KIT)),
      (e: unknown) => e instanceof ErroLlm && e.codigo === "invalido",
    );
  });

  it("falha do provedor vira ErroLlm 'http', com a mensagem do lib/llm", async () => {
    const { cliente } = falso({ n: 1 }, { erro: new Error("featherless: HTTP 503 | openrouter: HTTP 429") });
    await assert.rejects(
      cliente.completarJson(base(NOME_SCHEMA_ANALISE)),
      (e: unknown) => e instanceof ErroLlm && e.codigo === "http" && /503/.test(e.message),
    );
  });

  it("passou do prazo: ErroLlm 'timeout' (padrão 8 s; aqui, 30 ms pedidos)", async () => {
    const { cliente } = falso({ n: 1 }, { demora: 300 });
    await assert.rejects(
      cliente.completarJson(base(NOME_SCHEMA_ANALISE, { timeoutMs: 30 })),
      (e: unknown) => e instanceof ErroLlm && e.codigo === "timeout",
    );
  });

  it("sinal abortado: ErroLlm 'abortado'", async () => {
    const { cliente } = falso({ n: 1 }, { demora: 300 });
    const controle = new AbortController();
    const p = cliente.completarJson(base(NOME_SCHEMA_ANALISE, { sinal: controle.signal }));
    controle.abort();
    await assert.rejects(p, (e: unknown) => e instanceof ErroLlm && e.codigo === "abortado");
    const jaAbortado = AbortSignal.abort();
    await assert.rejects(
      falso({ n: 1 }).cliente.completarJson(base(NOME_SCHEMA_ANALISE, { sinal: jaAbortado })),
      (e: unknown) => e instanceof ErroLlm && e.codigo === "abortado",
    );
  });
});
