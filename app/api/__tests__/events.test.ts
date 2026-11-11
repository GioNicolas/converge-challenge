import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../events/route";

test("cliente não pode enviar eventos de uso gravados pelo servidor", async () => {
  const eventos = [
    {
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
    },
    { type: "transcricao_uso", sessionId: "sessao-teste", t: 0, contexto: "coding", escuta_id: "e", audioEnviadoS: 1, sessaoS: 1, conexoes: 1, reconexoes: 0, final: true },
    { type: "voz_uso", sessionId: "sessao-teste", t: 0, contexto: "coding", caracteres: 1 },
    { type: "voz_descartada", sessionId: "sessao-teste", t: 0, contexto: "coding", caracteres: 1, motivo: "cancelada" },
  ];
  for (const evento of eventos) {
    const resposta = await POST(new Request("http://local/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(evento),
    }));
    assert.equal(resposta.status, 400);
  }
});
