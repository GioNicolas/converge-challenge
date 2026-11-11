import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../events/route";

test("cliente não pode enviar evento llm_uso", async () => {
  const resposta = await POST(new Request("http://local/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "llm_uso",
      sessionId: "sessao-teste",
      t: 0,
      papel: "fala",
      modelo: "modelo",
      provedor: "openrouter",
      reserva_disparada: false,
      ms: 1,
      tokens_entrada: 1,
      tokens_saida: 1,
      custo_usd: 100,
    }),
  }));

  assert.equal(resposta.status, 400);
});
