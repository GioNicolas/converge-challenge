/**
 * Estado em memória (suficiente para a demo local). Fica em globalThis para
 * sobreviver ao hot reload do Next. Em serverless NÃO persiste entre
 * instâncias: trocar a implementação de `SlackStore` por banco quando precisar.
 */
import type { BookedSlot, CandidateSession, DecisionRecord, StoredPlan, TestSession } from "./types";

export interface SlackStore {
  getPlan(planId: string): StoredPlan | undefined;
  savePlan(plan: StoredPlan): void;
  getDecision(id: string): DecisionRecord | undefined;
  saveDecision(record: DecisionRecord): void;
  getTestSession(sessionId: string): TestSession | undefined;
  getTestSessionByToken(token: string): TestSession | undefined;
  saveTestSession(session: TestSession): void;
  getCandidateSessionByToken(token: string): CandidateSession | undefined;
  saveCandidateSession(session: CandidateSession): void;
  /** Agenda global de entrevistas já marcadas, de todas as vagas. */
  getBookedSlots(): BookedSlot[];
  bookSlot(slot: BookedSlot): void;
}

class MemoryStore implements SlackStore {
  private plans = new Map<string, StoredPlan>();
  private decisions = new Map<string, DecisionRecord>();
  private tests = new Map<string, TestSession>();
  private candidateSessions = new Map<string, CandidateSession>();
  private bookedSlots: BookedSlot[] = [];

  getPlan = (id: string) => this.plans.get(id);
  savePlan = (p: StoredPlan) => void this.plans.set(p.planId, p);
  getDecision = (id: string) => this.decisions.get(id);
  saveDecision = (r: DecisionRecord) => void this.decisions.set(r.id, r);
  getTestSession = (id: string) => this.tests.get(id);
  getTestSessionByToken = (token: string) => [...this.tests.values()].find((t) => t.token === token);
  saveTestSession = (s: TestSession) => void this.tests.set(s.sessionId, s);
  getCandidateSessionByToken = (token: string) =>
    [...this.candidateSessions.values()].find((s) => s.token === token);
  saveCandidateSession = (s: CandidateSession) => void this.candidateSessions.set(s.sessionId, s);
  getBookedSlots = () => this.bookedSlots;
  bookSlot = (slot: BookedSlot) => void this.bookedSlots.push(slot);
}

const g = globalThis as unknown as { __slackStore?: SlackStore };
export const store: SlackStore = (g.__slackStore ??= new MemoryStore());
