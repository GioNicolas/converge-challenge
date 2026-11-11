import assert from "node:assert/strict";
import { test } from "node:test";
import { isCandidateIdle } from "../policy";
import { registrarUsoLlm } from "../uso";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { appendEvent, getOrCreateSession } from "@/lib/session/store";
import { ultimoEvento } from "@/lib/session/eventos";

const resultado = { model: "m", provider: "openrouter", durationMs: 10, promptTokens: 100, completionTokens: 5, cachedTokens: 80, costUsd: 0.001 };

test("llm_uso entra na linha do tempo com o relógio da sessão, sem contar como ação do candidato", () => {
  const s = getOrCreateSession(`uso-${Date.now()}-${Math.random()}`, DEFAULT_CONFIG);
  const relogio = { agora: 0 };
  s.clock = () => relogio.agora;
  appendEvent(s, { type: "run", sessionId: s.sessionId, t: 0, result: { passed: 1, failed: 0, total: 1, cases: [] } as never });
  relogio.agora = 3_000;
  registrarUsoLlm(s, "analise", resultado);
  const uso = s.events.at(-1);
  assert.equal(uso?.type, "llm_uso");
  assert.equal(uso?.t, 3_000);
  assert.equal(ultimoEvento(s)?.type, "run");
  assert.equal(isCandidateIdle(s, 3_000), true);
});
