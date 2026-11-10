// Só desenvolvimento: grava relatórios de mentira (e os convites com o nome de cada candidato) para ver o painel
// "Ver resultados" funcionando sem fazer entrevistas. Vaga: "Backend de pagamentos" (config-backend-pagamentos).
//   npm run dev:semear     (com ARMAZENAMENTO=memoria no servidor não aparece: o servidor precisa ler data/)
// Apagar depois:  npm run dev:semear -- --limpar
import "./_gasto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { criarConvite, salvarConvite } from "@/lib/convites/store";
import { pastaDados } from "@/lib/dados";
import { relatorioExemplo } from "@/lib/session/relatorio-exemplo";
import { saveReport } from "@/lib/session/reports";

const CONFIG = "config-backend-pagamentos";
const PESSOAS = [
  { id: "semente-ana", nome: "Ana Souza", nota: 3.6, rec: "avancar" as const },
  { id: "semente-bruno", nome: "Bruno Lima", nota: 3.1, rec: "avancar" as const },
  { id: "semente-carla", nome: "Carla Mendes", nota: 2.4, rec: "talvez" as const },
  { id: "semente-diego", nome: "Diego Rocha", nota: 1.7, rec: "nao_avancar" as const },
];

async function main() {
  if (process.argv.includes("--limpar")) {
    for (const p of PESSOAS) await rm(join(pastaDados("reports"), `${p.id}.json`), { force: true });
    console.log("relatórios de semente apagados (os convites de teste ficam em data/convites; apague à mão se quiser)");
    return;
  }
  for (const [i, p] of PESSOAS.entries()) {
    const base = relatorioExemplo();
    const nota = Math.max(1, Math.min(4, Math.round(p.nota)));
    await saveReport(Date.now() - (i + 1) * 3_600_000, {
      ...base,
      sessionId: p.id,
      configId: CONFIG,
      overallScore: p.nota,
      recommendation: p.rec,
      criteria: base.criteria.map((c) => (c.score === null ? c : { ...c, score: nota })),
    });
    const convite = criarConvite({
      vagaId: CONFIG,
      configId: CONFIG,
      cargo: base.roleTitle,
      mode: "live_coding",
      durationMin: 45,
      languages: ["python"],
      candidato: { nome: p.nome, email: `${p.id}@exemplo.com` },
    });
    await salvarConvite({ ...convite, status: "simulado", sessoes: [p.id] });
  }
  console.log(`${PESSOAS.length} resultados semeados na vaga ${CONFIG}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
