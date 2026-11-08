// Bateria de conversa do Totti no quadro, com o LLM real: os casos que a equipe viu dar errado nos testes
// (perguntar quanto tempo dura, "não sei", "pula", esquecer o que já foi dito, perguntar o que já está na tela).
// Usa créditos do provedor. Só dados sintéticos.
//   npx tsx --env-file-if-exists=.env.local scripts/avaliar-totti-quadro.ts            (todos, 1 rodada)
//   RODADAS=3 SO=analise npx tsx --env-file-if-exists=.env.local scripts/avaliar-totti-quadro.ts
// Os casos ficam em scripts/placar-quadro/casos.ts (o placar usa os mesmos).
import { gerarAbertura } from "../lib/agente/abertura";
import { analisar } from "../lib/agente/analisar";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { perguntar } from "../lib/agente/perguntar";
import type { PedidoAnalise } from "../lib/agente/sessao/tipos";
import { CASOS_ANALISE, CASOS_FALA, conversa, estado, GRAFO, kit, MIN, pergunta, problema, REQUISITOS_NO_QUADRO } from "./placar-quadro/casos";

const llm = criarClientePrincipal();

type Resultado = { caso: string; ok: boolean; motivo?: string; texto: string; ms: number };
const resultados: Resultado[] = [];

function registrar(caso: string, texto: string, ms: number, falhas: string[]) {
  const ok = falhas.length === 0;
  resultados.push({ caso, ok, motivo: falhas.join("; ") || undefined, texto, ms });
  console.log(`${ok ? "OK  " : "FALHA"} ${caso} (${ms} ms)\n      ${JSON.stringify(texto)}${ok ? "" : `\n      -> ${falhas.join("; ")}`}`);
}

// ------------------------------------------------------------------ perguntar (fala com o candidato)

async function rodarFalas() {
  for (const caso of CASOS_FALA) {
    const agora = Date.now();
    const fase = caso.fase ?? "ALTO_NIVEL";
    const base = estado(fase, agora, {
      conversa: conversa(caso.historico ?? [], agora),
      ...(caso.perguntaAtiva
        ? {
            plin: "PERGUNTA_ATIVA" as const,
            perguntaAtiva: pergunta(1, caso.perguntaAtiva, "Códigos iguais?", agora - 30_000, fase),
            perguntas: [pergunta(1, caso.perguntaAtiva, "Códigos iguais?", agora - 30_000, fase)],
            perguntasFeitas: 1,
          }
        : {}),
      ...(caso.extra?.(agora) ?? {}),
    });
    const r = await perguntar(
      { llm, kit, problema },
      base,
      {
        fase,
        texto: caso.texto,
        grafo: caso.grafo ?? GRAFO,
        perguntaAtiva: caso.perguntaAtiva,
        requisitosAtuais: REQUISITOS_NO_QUADRO,
      },
      agora,
    );
    const falhas = r.falhou ? ["falha do provedor"] : caso.checar(r.texto, r);
    registrar(caso.nome, r.texto, Date.now() - agora, falhas);
  }
}

// ------------------------------------------------------------------ analisar (perguntas por iniciativa)

async function rodarAnalises(rodadas: number) {
  for (let rodada = 0; rodada < rodadas; rodada++) {
    for (const caso of CASOS_ANALISE) {
      const agora = Date.now();
      const perguntas = caso.perguntas(agora);
      const base = estado("APROFUNDAMENTO", agora, {
        conversa: conversa(caso.linhas, agora),
        perguntas,
        perguntasFeitas: perguntas.length,
        ultimaPerguntaEm: perguntas.length ? agora - 2 * MIN : null,
        ultimaRespostaEm: perguntas.length ? agora - 90_000 : null,
      });
      const pedido: PedidoAnalise = {
        sessao_id: "avaliacao-local",
        fase: "APROFUNDAMENTO",
        grafo: GRAFO,
        mudancas: "(nada mudou)",
        // Como o quadro manda hoje: só as últimas falas.
        conversa_recente: caso.linhas.slice(-6).map(([quem, texto]) => ({ quem, texto })),
        perguntas_feitas: perguntas.length,
        imagem_url: null,
        parado_ha_s: 25,
        requisitos: REQUISITOS_NO_QUADRO,
      };
      const r = await analisar({ llm, kit, problema }, base, pedido, agora);
      const fala = r.resposta.status === "ok" ? "(ok: ficou quieto)" : `[${r.resposta.status}] ${r.resposta.pergunta} | nota: ${r.resposta.nota}`;
      const falhas =
        r.diagnostico.origem === "erro"
          ? [`falha do provedor (${r.diagnostico.ajustes.join(",")})`]
          : r.resposta.status !== "ok" && caso.proibido.test(`${r.resposta.pergunta} ${r.resposta.nota}`)
            ? [caso.porque]
            : [];
      registrar(`${caso.nome}${rodadas > 1 ? ` #${rodada + 1}` : ""}`, fala, Date.now() - agora, falhas);
    }
  }
}

// ------------------------------------------------------------------ abertura

async function rodarAbertura() {
  const inicio = Date.now();
  const a = await gerarAbertura({ llm, kit, problema, duracaoMin: 35, etapas: "entender o problema (~5 min), visão geral (~10 min), aprofundar (~15 min), fechamento (~5 min)" });
  const texto = a?.apresentacao ?? "(sem abertura)";
  const falhas = [
    ...(!a ? ["abertura falhou"] : []),
    ...(!/totti/i.test(texto) ? ["não se apresentou pelo nome"] : []),
    ...(!/quadro|desenh/i.test(texto) ? ["não explicou como vai ser"] : []),
    ...(!/\d+\s*min|minutos/i.test(texto) ? ["não disse quanto tempo dura"] : []),
  ];
  registrar("abertura: se apresenta e explica", texto, Date.now() - inicio, falhas);
}

async function main() {
  const so = process.env.SO;
  const rodadas = Number(process.env.RODADAS) || 1;
  if (!so || so === "abertura") await rodarAbertura();
  if (!so || so === "fala") for (let i = 0; i < rodadas; i++) await rodarFalas();
  if (!so || so === "analise") await rodarAnalises(rodadas);
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} casos ok`);
  if (falhas.length) process.exitCode = 1;
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
