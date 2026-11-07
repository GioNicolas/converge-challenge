import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InterviewFeedbackPayload,
  InterviewInvitePayload,
  InterviewReschedulePayload,
} from "@/lib/email/types";

const base = {
  candidateName: "Maria Silva",
  to: "maria@exemplo.com",
  roleTitle: "Engenheira",
  scheduledAt: "2026-05-10T14:00:00-03:00",
  joinUrl: "https://exemplo.com/sala/1",
};

for (const [name, schema] of [
  ["invite", InterviewInvitePayload],
  ["reschedule", InterviewReschedulePayload],
] as const) {
  describe(name, () => {
    it("aceita offset e Z, e default de duração 30", () => {
      for (const scheduledAt of ["2026-05-10T14:00:00-03:00", "2026-05-10T17:00:00Z"]) {
        const r = schema.parse({ ...base, scheduledAt });
        assert.equal(r.durationMin, 30);
      }
    });
    it("rejeita scheduledAt não ISO ou sem offset", () => {
      for (const scheduledAt of ["amanhã", "10/05/2026", "2026-05-10", "2026-05-10T14:00:00", ""]) {
        assert.equal(schema.safeParse({ ...base, scheduledAt }).success, false, scheduledAt);
      }
    });
    it("rejeita candidateName vazio ou só espaços", () => {
      for (const candidateName of ["", "   ", "\t\n"]) {
        assert.equal(schema.safeParse({ ...base, candidateName }).success, false);
      }
    });
    it("aplica limites de tamanho", () => {
      assert.equal(schema.safeParse({ ...base, candidateName: "a".repeat(121) }).success, false);
      assert.equal(schema.safeParse({ ...base, candidateName: "a".repeat(120) }).success, true);
      assert.equal(schema.safeParse({ ...base, roleTitle: "a".repeat(161) }).success, false);
      assert.equal(schema.safeParse({ ...base, to: "a".repeat(250) + "@b.co" }).success, false);
      assert.equal(schema.safeParse({ ...base, durationMin: 481 }).success, false);
      assert.equal(schema.safeParse({ ...base, durationMin: 0 }).success, false);
      assert.equal(schema.safeParse({ ...base, joinUrl: "https://a.co/" + "a".repeat(2048) }).success, false);
    });
  });
}

describe("reschedule extras", () => {
  it("valida previousScheduledAt e limita reason", () => {
    assert.equal(InterviewReschedulePayload.safeParse({ ...base, previousScheduledAt: "ontem" }).success, false);
    assert.equal(
      InterviewReschedulePayload.safeParse({ ...base, previousScheduledAt: "2026-05-09T10:00:00Z" }).success,
      true,
    );
    assert.equal(InterviewReschedulePayload.safeParse({ ...base, reason: "a".repeat(501) }).success, false);
  });
});

describe("feedback", () => {
  const fb = { candidateName: "Maria", to: "maria@exemplo.com", roleTitle: "Eng" };
  it("exige recommendation do enum", () => {
    for (const recommendation of ["avancar", "talvez", "nao_avancar"]) {
      assert.equal(InterviewFeedbackPayload.safeParse({ ...fb, recommendation }).success, true);
    }
    assert.equal(InterviewFeedbackPayload.safeParse(fb).success, false);
    assert.equal(InterviewFeedbackPayload.safeParse({ ...fb, recommendation: "sim" }).success, false);
  });
  it("rejeita o formato antigo com `report` e descarta dados internos", () => {
    const old = { ...fb, report: { recommendation: "avancar", concerns: ["x"], nextSteps: ["y"] } };
    assert.equal(InterviewFeedbackPayload.safeParse(old).success, false);
    const r = InterviewFeedbackPayload.parse({ ...fb, recommendation: "talvez", concerns: ["x"] });
    assert.ok(!("concerns" in r));
  });
});
