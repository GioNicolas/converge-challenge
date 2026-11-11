import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { getOrCreateSession } from "@/lib/session/store";
import { perguntaBloqueadaAgora } from "../analyst";
import type { SessionState } from "@/lib/session/types";

function sessao(): SessionState {
  return getOrCreateSession(`analyst-block-${Date.now()}-${Math.random()}`, {
    ...DEFAULT_CONFIG,
    problemId: "climbing-stairs",
    durationMin: 15,
  });
}

test("perguntaBloqueadaAgora respeita ociosidade, balão pendente e sessão encerrada", () => {
  const s = sessao();
  assert.equal(perguntaBloqueadaAgora(s, 0), false);
  s.queue.push({ id: "q-1", question: "Explique?", followUpTopic: "x", priority: 1, createdAt: 0, status: "blipped" });
  s.pendingBlipId = "q-1";
  assert.equal(perguntaBloqueadaAgora(s, 0), true);
  s.pendingBlipId = undefined;
  s.queue = [];
  s.ended = true;
  assert.equal(perguntaBloqueadaAgora(s, 0), true);
});
