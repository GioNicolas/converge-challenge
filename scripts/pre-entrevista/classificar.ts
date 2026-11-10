/**
 * Roda o classificador (Jev) sobre as vagas de teste e mostra acertos.
 *
 *   npm run pre:classificar            # todas as vagas
 *   npm run pre:classificar -- ia-pleno # só uma
 */
import "../_gasto";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { classificarVaga } from "@/lib/pre-entrevista/classificador";

const filtro = process.argv[2];
const vagas = filtro ? VAGAS.filter((v) => v.id === filtro) : VAGAS;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ok = (b: boolean) => (b ? "✅" : "❌");

async function main() {
  let acertos = 0;
  let total = 0;

  const resultados = await Promise.all(vagas.map(async (v) => ({ v, r: await classificarVaga(v) })));

  for (const { v, r } of resultados) {
    const top = r.focusScores[0].area;
    const checks = [r.mode.value === v.esperado.mode, r.seniority.value === v.esperado.seniority, top === v.esperado.focoPrincipal];
    acertos += checks.filter(Boolean).length;
    total += checks.length;

    console.log(`\n■ ${v.id}  (${r.usage.ms} ms, ${r.usage.inputTokens ?? "?"} tokens)`);
    console.log(`  modo        ${ok(checks[0])} ${r.mode.value.padEnd(14)} conf ${pct(r.mode.confidence)}   esperado ${v.esperado.mode}`);
    console.log(
      `  senioridade ${ok(checks[1])} ${r.seniority.value.padEnd(14)} conf ${pct(r.seniority.confidence)}   esperado ${v.esperado.seniority}`,
    );
    console.log(`  foco topo   ${ok(checks[2])} ${top.padEnd(14)}              esperado ${v.esperado.focoPrincipal}`);
    console.log(`  notas       ${r.focusScores.map((s) => `${s.area}=${s.score.toFixed(2)} (P≥2 ${pct(s.pImportante)})`).join("  ")}`);
    console.log(`  focus       ${JSON.stringify(r.focus)}`);
    if (r.confirmar.length) console.log(`  confirmar   ${r.confirmar.join(", ")}`);
  }

  console.log(`\nAcertos: ${acertos}/${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
