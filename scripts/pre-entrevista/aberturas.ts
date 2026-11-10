/**
 * Mostra a abertura da Totti para vagas coladas pela recrutadora, sem HTTP: cria a sessão pelas mesmas funções da rota
 * (classificação, competências com resumo, sessão, abertura) e imprime o que cada uma decidiu, com o tempo de criação.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/pre-entrevista/aberturas.ts
 */
import "../_gasto";
import { classificarVaga } from "@/lib/pre-entrevista/classificador";
import { extrairCompetencias } from "@/lib/pre-entrevista/competencias";
import { criarSessao } from "@/lib/pre-entrevista/sessoes";
import { abrirConversa } from "@/lib/pre-entrevista/turno";

/** Vagas reais, sem nível explícito no texto (exceto a do Tech Lead, que tem o nível claro). */
const VAGAS: Array<[string, string]> = [
  [
    "Cientista de Dados",
    "Buscamos cientista de dados para criar modelos de previsão de churn, trabalhar com Python, pandas, scikit-learn e SQL, e apresentar resultados para a diretoria.",
  ],
  [
    "Desenvolvedor Mobile",
    "Desenvolver o app iOS e Android em React Native, integrar com APIs REST, publicar nas lojas e acompanhar métricas de crash.",
  ],
  [
    "Engenheiro DevOps",
    "Manter pipelines de CI/CD, infraestrutura na AWS com Terraform, Kubernetes, monitoramento com Prometheus e Grafana, e participar do on-call.",
  ],
  [
    "Analista de QA",
    "Escrever testes automatizados com Cypress, revisar critérios de aceite com o produto e garantir a qualidade das entregas.",
  ],
  [
    "Tech Lead Backend",
    "Liderar time de 6 pessoas, definir arquitetura de microsserviços em Java/Spring, conduzir code reviews e alinhar roadmap técnico com produto.",
  ],
];

/** Logs do servidor (`[pre-entrevista]`) poluem a saída; os eventos relevantes são impressos aqui. */
function silenciarLogsDoServidor(): void {
  const log = console.log;
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[pre-entrevista]")) return;
    log(...args);
  };
}

async function main(): Promise<void> {
  silenciarLogsDoServidor();
  for (const [cargo, descricao] of VAGAS) {
    const vaga = { roleTitle: cargo, jobDescription: descricao };
    const inicio = Date.now();
    const classificacao = await classificarVaga(vaga);
    const competencias = await extrairCompetencias(vaga);
    const sessao = criarSessao(vaga, classificacao, inicio, competencias);
    abrirConversa(sessao);
    const tempoMs = Date.now() - inicio;

    const confianca = (c: number) => `${Math.round(c * 100)}%`;
    console.log(`\n=== ${cargo} ===`);
    console.log(
      `classificação: modo=${classificacao.mode.value} (${confianca(classificacao.mode.confidence)}) | senioridade=${classificacao.seniority.value} (${confianca(classificacao.seniority.confidence)})`,
    );
    console.log(`nivel_explicito: ${classificacao.nivelExplicito.toFixed(2)}`);
    console.log(`confirmar: [${classificacao.confirmar.join(", ")}]`);
    console.log(`foco: ${classificacao.focus.map((f) => `${f.area}:${f.weight}`).join(" ")}`);
    console.log(`resumo: ${sessao.resumoVaga ?? "(sem resumo)"}`);
    console.log(`tempo de criação da sessão: ${tempoMs} ms`);
    console.log(`abertura: ${sessao.transcricao[0].text}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
