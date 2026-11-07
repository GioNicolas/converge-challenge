import assert from "node:assert/strict";
import { it } from "node:test";
import { CENARIOS_SCORECARD, executarCenarioScorecard } from "../../dev/scorecard/cenarios";

assert.equal(CENARIOS_SCORECARD.length, 68);
for (const cenario of CENARIOS_SCORECARD) {
  it(`scorecard pelos handlers: ${cenario.id}`, async () => { await executarCenarioScorecard(cenario); });
}
