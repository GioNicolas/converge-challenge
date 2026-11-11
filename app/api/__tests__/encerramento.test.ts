import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "../encerramento/route";
import { getOrCreateSession } from "@/lib/session/store";
import { runInterviewerTurn } from "@/lib/agents/interviewer";

async function chamar(sessionId: string, gatilho?: string) {
  return POST(new Request("http://local/api/encerramento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId, ...(gatilho ? { gatilho } : {}) }) }));
}

describe("POST /api/encerramento", () => {
  it("com candidatas e gatilho tempo abre blip idempotente", async () => {
    const id = `encerramento-${Date.now()}-tempo`;
    const session = getOrCreateSession(id);
    session.queue.push({ id: "q-fechamento", question: "Qual é o custo dessa solução?", followUpTopic: "complexidade", priority: 1, createdAt: 0, status: "queued", kind: "sondar" });
    const primeira = await (await chamar(id, "tempo")).json();
    const segunda = await (await chamar(id, "tempo")).json();
    assert.ok(primeira.blip);
    assert.ok(session.blips.some((blip) => blip.id === primeira.blip.id));
    assert.equal(session.fechamentoBlipId, primeira.blip.id);
    let chamadas = 0;
    const antiga = globalThis.fetch;
    const chaveAntiga = process.env.FEATHERLESS_API_KEY;
    process.env.FEATHERLESS_API_KEY = "teste";
    globalThis.fetch = (async () => { chamadas++; throw new Error("não deveria chamar LLM"); }) as typeof fetch;
    try {
      const turno = await runInterviewerTurn(session, { blipId: primeira.blip.id, messages: [] });
      assert.match(turno.reply, /tempo está acabando/i);
      assert.match(turno.reply, /custo dessa solução/i);
      assert.equal(turno.end, false);
      assert.equal(chamadas, 0);
    } finally {
      globalThis.fetch = antiga;
      if (chaveAntiga === undefined) delete process.env.FEATHERLESS_API_KEY;
      else process.env.FEATHERLESS_API_KEY = chaveAntiga;
    }
    assert.deepEqual(segunda, primeira);
    assert.equal(session.fechamento?.gatilho, "tempo");
    assert.equal(session.fechamento?.etapa, "perguntas_finais");
  });

  it("sem candidatas mantém a última palavra; pediu_encerrar devolve despedida", async () => {
    const semPerguntas = `encerramento-${Date.now()}-vazio`;
    getOrCreateSession(semPerguntas);
    const resposta = await (await chamar(semPerguntas)).json();
    assert.ok(resposta.blip);
    assert.ok(getOrCreateSession(semPerguntas).blips.some((blip) => blip.id === resposta.blip.id));
    const pediu = `encerramento-${Date.now()}-pedido`;
    getOrCreateSession(pediu);
    const direta = await (await chamar(pediu, "pediu_encerrar")).json();
    assert.match(direta.despedida, /Obrigado/);
    assert.equal((await (await chamar(pediu, "pediu_encerrar")).json()).despedida, direta.despedida);
  });
});
