// Gera o kit de avaliação das vagas mock e imprime um relatório de qualidade (validador).
//   npx tsx scripts/gerar-kit.ts <vaga-id|--todas> [--fake] [--saida pasta] [--analisar]
// --fake: LLM falso, sem rede. --analisar: depois de gerar, roda UM `analisar` ao vivo com um grafo
// falho escrito à mão para a área (prova que o prompt funciona em áreas diferentes).
// A chave vem de OPENROUTER_API_KEY (ambiente ou .env.local/.env). Ela nunca é impressa.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analisar } from "../lib/agente/analisar";
import { JOB_POSTINGS } from "../lib/hiring/mocks/job-postings";
import { kitFalso } from "../lib/agente/kits/falso";
import { ErroGeracaoKit, gerarKitDetalhado } from "../lib/agente/kits/gerar";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { criarClienteFalso, type LlmCliente } from "../lib/agente/llm/cliente";
import { NOME_SCHEMA_KIT } from "../lib/agente/prompts/gerador-kit";
import { estadoInicial, transicionar } from "../lib/agente/sessao/estado";
import { GRAFO_GENERICO, GRAFOS_VAGAS } from "./exemplos/grafos-vagas";

function carregarEnvLocal() {
  for (const nome of [".env.local", ".env"]) {
    if (!existsSync(nome)) continue;
    for (const linha of readFileSync(nome, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function opcao(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const todas = args.includes("--todas");
  const fake = args.includes("--fake");
  const rodarAnalise = args.includes("--analisar");
  const saida = resolve(opcao(args, "--saida") ?? "kits-gerados");
  const alvoId = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--saida");
  const vagas = todas ? JOB_POSTINGS : JOB_POSTINGS.filter((v) => v.id === alvoId);
  if (!vagas.length) {
    console.error(`Uso: npx tsx scripts/gerar-kit.ts <vaga-id|--todas> [--fake] [--saida pasta] [--analisar]\nVagas: ${JOB_POSTINGS.map((v) => v.id).join(", ")}`);
    process.exit(1);
  }

  carregarEnvLocal();
  if (!fake && !process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY não encontrada (ambiente ou .env.local/.env). Defina a chave ou use --fake.");
    process.exit(1);
  }
  const llm: LlmCliente = fake
    ? criarClienteFalso((a) =>
        a.nomeSchema === NOME_SCHEMA_KIT
          ? kitFalso(a.mensagens[0].content.match(/"title":\s*"([^"]+)"/)?.[1])
          : { status: "ok", pergunta: null, nota: null, elementos: [], degrau: null, observacoes: [] },
      )
    : criarClientePrincipal();
  mkdirSync(saida, { recursive: true });

  let falhas = 0;
  for (const vaga of vagas) {
    console.log(`\n=== ${vaga.id} (${vaga.seniority}) ===`);
    try {
      const r = await gerarKitDetalhado({ llm, vaga });
      const p = r.kit.problemas[0];
      const meta = {
        vaga: vaga.id,
        modelo: r.modelo,
        ms: r.ms,
        tentativas: r.tentativas,
        uso: r.uso,
        errosPrimeiraTentativa: r.errosPrimeiraTentativa,
        avisos: r.avisos,
      };
      const arquivo = resolve(saida, `kit-${vaga.id}.json`);
      writeFileSync(arquivo, JSON.stringify({ meta, kit: r.kit }, null, 2) + "\n", "utf8");
      console.log(`  modelo ........ ${r.modelo}`);
      console.log(`  latência ...... ${(r.ms / 1000).toFixed(1)} s, ${r.tentativas} tentativa(s)`);
      console.log(`  tokens ........ entrada ${r.uso.entrada}, saída ${r.uso.saida}${r.uso.custo !== undefined ? `, custo US$ ${r.uso.custo.toFixed(4)}` : ""}`);
      console.log(`  área/persona .. ${r.kit.area} | ${r.kit.persona}`);
      console.log(`  problema ...... ${p.titulo} [${r.kit.modoLeitura}]`);
      console.log(`  enunciado ..... (${p.enunciado.length} chars) ${p.enunciado}`);
      console.log(`  rubrica ....... ${r.kit.criterios.length} critérios: ${r.kit.criterios.map((c) => c.id).join(", ")}`);
      console.log(`  ficha ${p.ficha.length} | sinais ${p.sinaisEsperados.length} | armadilhas ${p.armadilhas.length} | perguntas ${p.perguntasSugeridas.length} | tipos ${r.kit.tiposPergunta.length} | termos ${r.kit.termosTranscricao.length}`);
      if (r.errosPrimeiraTentativa.length) console.log(`  1ª tentativa inválida: ${r.errosPrimeiraTentativa.join(" ; ")}`);
      if (r.avisos.length) console.log(`  avisos: ${r.avisos.join(" ; ")}`);
      console.log(`  salvo em ${arquivo}`);

      if (rodarAnalise) {
        const g = GRAFOS_VAGAS[vaga.id] ?? GRAFO_GENERICO;
        const t0 = 1_000_000_000;
        let estado = estadoInicial({ criterios: r.kit.criterios.map((c) => c.id) });
        estado = transicionar(estado, { tipo: "COMECAR" }, t0).estado;
        estado = transicionar(estado, { tipo: "SINCRONIZAR_FASE", fase: "APROFUNDAMENTO" }, t0).estado;
        const agora = t0 + 120_000;
        const a = await analisar(
          { llm, kit: r.kit, problema: p, maxTokens: 800, log: () => {} },
          estado,
          {
            sessao_id: "script",
            fase: "APROFUNDAMENTO",
            grafo: g.grafo,
            mudancas: g.mudancas,
            conversa_recente: [
              { quem: "agente", texto: p.enunciado },
              { quem: "candidato", texto: g.fala },
            ],
            perguntas_feitas: 0,
            imagem_url: null,
          },
          agora,
          AbortSignal.timeout(30_000),
        );
        writeFileSync(resolve(saida, `analise-${vaga.id}.json`), JSON.stringify({ resposta: a.resposta, diagnostico: a.diagnostico }, null, 2) + "\n", "utf8");
        console.log(`  --- analisar (ao vivo) ---`);
        console.log(`  origem ${a.diagnostico.origem}, ${a.diagnostico.ms ?? "?"} ms, ajustes [${a.diagnostico.ajustes.join(", ")}], uso ${JSON.stringify(a.diagnostico.uso ?? {})}`);
        console.log(`  status ${a.resposta.status} | pergunta: ${a.resposta.pergunta ?? "-"} | nota: ${a.resposta.nota ?? "-"} | elementos ${a.resposta.elementos.join(",") || "-"}`);
        console.log(`  observações: ${a.resposta.observacoes.map((o) => `${o.criterio}/${o.sinal}`).join(", ") || "-"}`);
      }
    } catch (e) {
      falhas++;
      if (e instanceof ErroGeracaoKit) {
        console.log(`  FALHOU (${e.codigo}): ${e.message}`);
        for (const x of e.erros) console.log(`    - ${x}`);
      } else console.log(`  FALHOU: ${(e as Error).message}`);
    }
  }
  console.log(`\n${vagas.length - falhas}/${vagas.length} kits gerados.`);
  if (falhas) process.exit(2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "erro");
  process.exit(1);
});
