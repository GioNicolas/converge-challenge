/**
 * Validação dos mocks de vagas e candidatos. Rode com: npx tsx lib/hiring/validate-mocks.ts
 */
import assert from "node:assert/strict";
import { JobPosting } from "./job-posting";
import { Candidate } from "./candidate";
import { JOB_POSTINGS } from "./mocks/job-postings";
import { CANDIDATES } from "./mocks/candidates";

JOB_POSTINGS.forEach((j) => JobPosting.parse(j));
CANDIDATES.forEach((c) => Candidate.parse(c));

const jobIds = JOB_POSTINGS.map((j) => j.id);
const candIds = CANDIDATES.map((c) => c.id);
assert.equal(new Set(jobIds).size, jobIds.length, "ids de vagas duplicados");
assert.equal(new Set(candIds).size, candIds.length, "ids de candidatos duplicados");

const counts = new Map<string, number>();
for (const c of CANDIDATES) {
  assert.ok(
    jobIds.includes(c.jobPostingId),
    `${c.id}: jobPostingId inexistente (${c.jobPostingId})`,
  );
  counts.set(c.jobPostingId, (counts.get(c.jobPostingId) ?? 0) + 1);
}
for (const id of jobIds) assert.equal(counts.get(id), 2, `${id}: esperado 2 candidatos`);

console.log(`OK: ${JOB_POSTINGS.length} vagas, ${CANDIDATES.length} candidatos, 2 por vaga.`);
