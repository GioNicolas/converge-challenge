// Teste manual da revisão da questão (issue #90), com o modelo de verdade e SEM gravar nada:
//   1. a questão real da issue passa pela revisão;
//   2. N questões (padrão 10, uma por vaga mock) são geradas em sequência pelo gerador real e revisadas.
//   npx tsx --env-file=.env scripts/testar-revisao-questao.ts [--n 10]
// Sem --pago a OpenRouter fica desligada (./_gasto): roda na Featherless. Imprime o texto para conferir a mão
// o título e a concordância; as contagens automáticas são só números e tamanhos.
import "./_gasto";
import { InterviewConfig } from "../lib/contracts";
import { casoReal } from "../lib/agente/kits/caso-real-issue-90";
import { camposComNumeroAlterado, revisarProblema } from "../lib/agente/kits/revisar";
import { gerarProblema } from "../lib/agente/kits/questao-da-vaga";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { JOB_POSTINGS } from "../lib/hiring/mocks/job-postings";

const LIMITE_FALA = 220;
const frases = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean).length;

async function main() {
  const i = process.argv.indexOf("--n");
  const n = i >= 0 ? Number(process.argv[i + 1]) : 10;
  const llm = criarClientePrincipal();

  console.log("=== CASO REAL (issue #90) ===");
  const real = casoReal();
  const rr = await revisarProblema(real, llm);
  console.log(`aceita=${rr.aceita} mudou=${rr.mudou} descartada=${rr.descartada ?? "-"} modelo=${rr.modelo} ${rr.ms} ms`);
  for (const p of rr.problemas) console.log(`  - ${p}`);
  console.log(`título:    "${real.titulo}" -> "${rr.problema.titulo}"`);
  console.log(`enunciado: ${rr.problema.enunciado}`);
  console.log(`fala (${real.falaDoDesafio!.length} -> ${rr.problema.falaDoDesafio!.length} car., ${frases(rr.problema.falaDoDesafio!)} frases): ${rr.problema.falaDoDesafio}`);
  for (const [k, f] of rr.problema.ficha.entries()) if (f.pergunta !== real.ficha[k].pergunta || f.resposta !== real.ficha[k].resposta) console.log(`ficha[${k}]: ${f.resposta}`);
  console.log(`números alterados: ${JSON.stringify(camposComNumeroAlterado(real, rr.problema))}`);

  console.log(`\n=== ${n} QUESTÕES GERADAS EM SEQUÊNCIA ===`);
  let geradas = 0;
  let aceitas = 0;
  let falaOk = 0;
  let falaOkAntes = 0;
  let duasFrases = 0;
  let totalProblemas = 0;
  for (const vaga of JOB_POSTINGS.slice(0, n)) {
    const config = InterviewConfig.parse({
      id: `teste-${vaga.id}`,
      mode: "system_design",
      roleTitle: vaga.title,
      jobDescription: vaga.description,
      seniority: vaga.seniority === "staff" ? "senior" : vaga.seniority,
      focus: [{ area: "escala_produto", weight: 0.6 }, { area: "tecnico", weight: 0.4 }],
      criteria: [{ id: "c1", name: "Trade-offs", description: "Justifica escolhas", weight: 1, focus: "escala_produto" }],
      problemId: "encurtador-de-url",
      languages: ["python"],
    });
    console.log(`\n--- ${vaga.id}`);
    try {
      const g = await gerarProblema(config, llm);
      geradas++;
      const r = await revisarProblema(g.problema, llm);
      if (r.aceita) aceitas++;
      totalProblemas += r.problemas.length;
      const antes = g.problema.falaDoDesafio?.length ?? 0;
      const depois = r.problema.falaDoDesafio?.length ?? 0;
      if (antes <= LIMITE_FALA) falaOkAntes++;
      if (depois <= LIMITE_FALA) falaOk++;
      if (frases(r.problema.falaDoDesafio ?? "") <= 2) duasFrases++;
      console.log(`geração: ${g.ms} ms, ${g.tentativas} tentativa(s), ${g.modelo}; revisão: aceita=${r.aceita} mudou=${r.mudou} ${r.descartada ? `descartada=${r.descartada}` : ""} ${r.ms} ms`);
      for (const p of r.problemas) console.log(`  achou: ${p}`);
      console.log(`título:    "${g.problema.titulo}" -> "${r.problema.titulo}"`);
      console.log(`enunciado: ${r.problema.enunciado}`);
      console.log(`fala (${antes} -> ${depois} car., ${frases(r.problema.falaDoDesafio ?? "")} frases): ${r.problema.falaDoDesafio}`);
    } catch (e) {
      console.log(`FALHOU na geração: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nResumo: ${geradas}/${n} geradas sem erro; ${aceitas}/${geradas} revisões aceitas; fala <= ${LIMITE_FALA} car. antes ${falaOkAntes}/${geradas}, depois ${falaOk}/${geradas}; fala com no máximo 2 frases depois ${duasFrases}/${geradas}; problemas apontados pelo revisor: ${totalProblemas}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
