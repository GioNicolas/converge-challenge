/**
 * Simula a pré-entrevista sobre as transcrições de teste: classifica a vaga e, a cada fala da
 * recrutadora, extrai o rascunho com a conversa até ali e mede a cobertura. No fim valida o
 * InterviewConfig e confere se os pesos dos critérios batem com o foco.
 *
 *   npm run pre:extrair                       # todas as transcrições
 *   npm run pre:extrair -- ia-pleno           # só uma
 */
import { TRANSCRICOES } from "@/fixtures/pre-entrevista/transcricoes";
import { VAGAS } from "@/fixtures/pre-entrevista/vagas";
import { classificarVaga } from "@/lib/pre-entrevista/classificador";
import { aplicarCobertura, avaliarCobertura } from "@/lib/pre-entrevista/cobertura";
import { extrair } from "@/lib/pre-entrevista/extrator";
import { criarRascunho, paraInterviewConfig, somaPorArea, type Rascunho, type Turno } from "@/lib/pre-entrevista/rascunho";

const filtro = process.argv[2];
const transcricoes = filtro ? TRANSCRICOES.filter((t) => t.id === filtro) : TRANSCRICOES;

const trecho = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}...` : s);

function imprimirRascunho(r: Rascunho): void {
  console.log(`  mode        ${r.mode}`);
  console.log(`  seniority   ${r.seniority}`);
  console.log(`  confirmado  ${JSON.stringify(r.confirmado)}`);
  console.log(`  focus       ${r.focus.map((f) => `${f.area}=${f.weight}`).join("  ")}`);
  console.log(`  durationMin ${r.durationMin ?? "(padrão)"}`);
  console.log(`  problemId   ${r.problemId ?? "(padrão)"}`);
  console.log(`  notas       ${r.recruiterNotes || "(vazio)"}`);
  console.log(`  criteria (${r.criteria.length}):`);
  for (const c of r.criteria) {
    console.log(`    - ${c.id} | ${c.name} | focus=${c.focus} | weight=${c.weight}`);
    console.log(`      ${c.description}`);
  }
  console.log(`  pendencias  ${r.pendencias.join(", ") || "(nenhuma)"}`);
}

/** Teste rápido: soma dos pesos dos critérios de cada área, dividida pela soma total, contra o peso no foco. */
function imprimirConferenciaPesos(r: Rascunho): boolean {
  let ok = true;
  console.log("  área            no foco   nos critérios");
  for (const linha of somaPorArea(r.criteria, r.focus)) {
    const bate = Math.abs(linha.noFoco - linha.nosCriterios) <= 0.02;
    if (!bate) ok = false;
    console.log(
      `  ${linha.area.padEnd(15)} ${linha.noFoco.toFixed(2).padStart(7)}   ${linha.nosCriterios.toFixed(2).padStart(7)}  ${bate ? "ok" : "DIVERGE"}`,
    );
  }
  return ok;
}

async function main() {
  for (const t of transcricoes) {
    const vaga = VAGAS.find((v) => v.id === t.vagaId);
    if (!vaga) throw new Error(`vaga "${t.vagaId}" não encontrada em fixtures/pre-entrevista/vagas.ts`);

    console.log(`\n========== ${t.id}  (${t.turnos.length} turnos) ==========`);

    const classificacao = await classificarVaga(vaga);
    let rascunho = criarRascunho(vaga, classificacao);
    console.log(
      `classificador (${classificacao.usage.ms} ms): modo=${rascunho.mode} senioridade=${rascunho.seniority} ` +
        `focus=${rascunho.focus.map((f) => `${f.area}=${f.weight}`).join(" ")} confirmar=[${classificacao.confirmar.join(", ")}]`,
    );

    // A cada fala da recrutadora: extrai com a conversa até ali, depois mede a cobertura no rascunho atualizado.
    let msExtrator = 0;
    let msCobertura = 0;
    const passos: number[] = [];
    for (let i = 0; i < t.turnos.length; i++) {
      if (t.turnos[i].role === "recrutadora") passos.push(i);
    }
    // Se a conversa terminar com fala do agente, há um último passo com a transcrição completa.
    if (t.turnos.length > 0 && t.turnos[t.turnos.length - 1].role !== "recrutadora") passos.push(t.turnos.length - 1);

    console.log("\nconversa (extração incremental e cobertura por fala):");
    for (const i of passos) {
      const ate: Turno[] = t.turnos.slice(0, i + 1);
      const ext = await extrair(rascunho, ate);
      const cob = await avaliarCobertura(ext.rascunho, ate);
      rascunho = aplicarCobertura(ext.rascunho, cob.cobertura);
      msExtrator += ext.ms;
      msCobertura += cob.ms;
      console.log(`  turno ${i + 1}  "${trecho(t.turnos[i].text)}"`);
      console.log(
        `    extrator ${ext.ms} ms (${ext.provedor}/${ext.model}) | cobertura ${cob.ms} ms | faltando: ${rascunho.pendencias.join(", ") || "nada"}`,
      );
    }

    console.log("\nprobabilidades de cobertura (máximo observado):");
    for (const [id, p] of Object.entries(rascunho.cobertura)) console.log(`  ${id.padEnd(24)} ${p.toFixed(2)}`);

    console.log("\n--- rascunho final ---");
    imprimirRascunho(rascunho);

    console.log("\n--- conferência de pesos (teste rápido) ---");
    const pesosOk = imprimirConferenciaPesos(rascunho);
    console.log(`  resultado: ${pesosOk ? "ok" : "DIVERGE"}`);

    const resultado = paraInterviewConfig(rascunho);
    console.log("\n--- paraInterviewConfig ---");
    if (resultado.ok)
      console.log(`  ok (id=${resultado.config.id}, problemId=${resultado.config.problemId}, durationMin=${resultado.config.durationMin})`);
    else console.log(`  erros:\n${resultado.erros.map((e) => `    - ${e}`).join("\n")}`);

    console.log(
      `\ntempos: classificador ${classificacao.usage.ms} ms | extrator (total) ${msExtrator} ms | cobertura (total) ${msCobertura} ms`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
