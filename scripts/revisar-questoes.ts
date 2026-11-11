// Audita as questões geradas já salvas (namespace `avaliacao`, ids "questao-<config>") rodando a revisão de texto
// em modo SÓ LEITURA: imprime o que o revisor achou de errado e o que mudaria. NUNCA grava nada.
//   npx tsx --env-file=.env scripts/revisar-questoes.ts [--id questao-cfg-xxx] [--limite 20]
// Sem --pago a OpenRouter fica desligada (ver ./_gasto): roda na Featherless. O Supabase do .env só é lido.
import "./_gasto";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import type { RegistroAvaliacao } from "../lib/agente/kits/repositorio";
import { revisarProblema } from "../lib/agente/kits/revisar";
import { errosDoProblema } from "../lib/agente/kits/validar";
import { kvRemoto } from "../lib/storage/kv";

function opcao(nome: string): string | undefined {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const kv = kvRemoto();
  if (!kv) {
    console.error("Supabase não configurado (use --env-file=<.env>). Nada a auditar.");
    process.exit(1);
  }
  const alvo = opcao("--id");
  const limite = Number(opcao("--limite") ?? 50);
  const todos = (await kv.list<RegistroAvaliacao>("avaliacao")).map((r) => r.value).filter((r) => r?.problema);
  const geradas = todos.filter((r) => r.avaliacaoId.startsWith("questao-") && (!alvo || r.avaliacaoId === alvo)).slice(-limite);
  console.log(`${geradas.length} questão(ões) gerada(s) de ${todos.length} avaliações salvas. Modo só-leitura: nada é gravado.\n`);

  const llm = criarClientePrincipal();
  let comProblema = 0;
  let descartadas = 0;
  for (const reg of geradas) {
    const p = reg.problema;
    const r = await revisarProblema(p, llm);
    console.log(`=== ${reg.avaliacaoId} (${reg.aprovado ? "aprovada" : "não aprovada"}) · "${p.titulo}"`);
    const validador = errosDoProblema(p);
    if (validador.length) console.log(`  validador atual: ${validador.join(" ; ")}`);
    if (r.descartada) {
      descartadas++;
      console.log(`  revisão descartada: ${r.descartada}`);
    }
    if (r.problemas.length) {
      comProblema++;
      for (const x of r.problemas) console.log(`  - ${x}`);
    }
    if (r.aceita && r.mudou) {
      const q = r.problema;
      if (q.titulo !== p.titulo) console.log(`  título: "${p.titulo}" -> "${q.titulo}"`);
      if (q.falaDoDesafio !== p.falaDoDesafio) console.log(`  fala (${p.falaDoDesafio?.length ?? 0} -> ${q.falaDoDesafio?.length ?? 0} car.): ${q.falaDoDesafio}`);
      if (q.enunciado !== p.enunciado) console.log(`  enunciado: ${q.enunciado}`);
    }
    if (!r.problemas.length && !r.descartada && !validador.length) console.log("  sem problemas");
    console.log(`  (${r.modelo ?? "?"}, ${r.ms} ms)\n`);
  }
  console.log(`${comProblema}/${geradas.length} com problemas apontados; ${descartadas} revisões descartadas pelas guardas. Nada foi gravado.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
