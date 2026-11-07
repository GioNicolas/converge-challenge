import { criarClienteOpenRouter } from "../lib/agente/llm/cliente";
import { CENARIOS_SCORECARD, executarCenarioScorecard } from "../lib/dev/scorecard/cenarios";

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Configure OPENROUTER_API_KEY no ambiente ou .env.local. Ex.: npm run eval:scorecard -- --filtro=produto");
    process.exitCode = 1;
    return;
  }
  const filtro = process.argv.find(a => a.startsWith("--filtro="))?.slice(9);
  const cenarios = CENARIOS_SCORECARD.filter(c => !filtro || c.id.includes(filtro));
  if (!cenarios.length) throw new Error("Nenhum cenário corresponde ao filtro");
  const llm = criarClienteOpenRouter();
  let falhas = 0;
  for (const c of cenarios) {
    try {
      const sc = await executarCenarioScorecard(c, llm);
      console.log(JSON.stringify({ cenario: c.id, scorecard: sc }, null, 2));
    } catch (e) {
      falhas++;
      console.error(JSON.stringify({ cenario: c.id, falha: e instanceof Error ? e.message : "falha desconhecida" }));
    }
  }
  console.log(JSON.stringify({ sessoes: cenarios.length, falhas }));
  if (falhas) process.exitCode = 1;
}
main().catch(() => { console.error("Falha ao executar os evals"); process.exitCode = 1; });
