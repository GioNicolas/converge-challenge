/**
 * ÚNICO lugar que sabe onde a entrevista acontece. Hoje é uma URL provisória;
 * quando a chamada própria existir, só esta função muda.
 */
import { randomUUID } from "node:crypto";
import { store } from "./store";
import type { TestSession } from "./types";

/** URL pública da sala. TODO: trocar quando o software de chamada estiver pronto. */
export function buildInterviewUrl(token: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base}/interview/${token}`;
}

/** Cria uma sessão de teste ligada ao plano e devolve o link. Não toca em candidato nem em email. */
export function createTestSession(planId: string, createdBy: string): { session: TestSession; url: string } {
  const session: TestSession = {
    sessionId: `test-${randomUUID()}`,
    token: randomUUID(),
    planId,
    createdBy,
    createdAt: Date.now(),
  };
  store.saveTestSession(session);
  return { session, url: buildInterviewUrl(session.token) };
}
