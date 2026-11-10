// Repassa pela análise do desenho (o Pensador) os desenhos de uma sessão real de quadro, na ordem e nos horários em
// que aconteceram, para ver o que o Totti perguntaria hoje. Só a análise: as falas do Totti na conversa são as da
// sessão original. Sem `--pago` roda só na Featherless (não gasta crédito da OpenRouter).
//
//   npx tsx --env-file-if-exists=.env.local scripts/replay-analises-quadro.ts <sessao.json> [--ate 460]
//
// <sessao.json>: { estado: [{ value }], eventos: [{ value: { evento } }] }, como sai da tabela kv do Supabase
// (namespaces `estado` e `evento:<id>`).
import "./_gasto";
import { readFileSync } from "node:fs";
import { analisar } from "../lib/agente/analisar";
import { KIT_SYSTEM_DESIGN as kit } from "../lib/agente/kits/system-design";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { estadoInicial, transicionar, type EstadoSessao } from "../lib/agente/sessao/estado";
import type { Fase, FalaRecente } from "../lib/agente/sessao/tipos";

const arquivo = process.argv[2];
if (!arquivo) throw new Error("uso: replay-analises-quadro.ts <sessao.json> [--ate segundos]");
const iAte = process.argv.indexOf("--ate");
const ateS = iAte >= 0 ? Number(process.argv[iAte + 1]) : Infinity;

type Evento = { horario: string; tipo: string; dados: Record<string, unknown> };
const dump = JSON.parse(readFileSync(arquivo, "utf8"));
const original: EstadoSessao = dump.estado[0].value;
const eventos: Evento[] = dump.eventos.map((x: { value: { evento: Evento } }) => x.value.evento)
  .sort((a: Evento, b: Evento) => Date.parse(a.horario) - Date.parse(b.horario));
const t0 = original.iniciadaEm ?? Date.parse(eventos[0].horario);
const problema = kit.problemas.find((p) => p.titulo === "Chat em tempo real") ?? kit.problemas[0];

async function main() {
  const llm = criarClientePrincipal();
  let estado: EstadoSessao = { ...estadoInicial({ tempos: original.tempos, plano: original.plano }), iniciadaEm: t0 };
  const conversa: FalaRecente[] = [];
  let perguntas = 0;
  let respostaEm: number | null = null;
  for (const e of eventos) {
    const em = Date.parse(e.horario);
    const s = Math.round((em - t0) / 1000);
    if (s > ateS) break;
    if (respostaEm !== null && em >= respostaEm) {
      estado = transicionar(estado, { tipo: "CANDIDATO_FALOU", texto: "(respondeu)", fimDeResposta: true }, respostaEm).estado;
      respostaEm = null;
    }
    if (e.tipo === "fase") estado = transicionar(estado, { tipo: "SINCRONIZAR_FASE", fase: e.dados.fase as Fase }, em).estado;
    else if (e.tipo === "fala" && typeof e.dados.texto === "string") {
      const quem = e.dados.quem === "agente" ? "agente" : "candidato";
      conversa.push({ quem, texto: e.dados.texto });
      estado = quem === "agente"
        ? transicionar(estado, { tipo: "AGENTE_FALOU", texto: e.dados.texto }, em).estado
        : transicionar(estado, { tipo: "CANDIDATO_FALOU", texto: e.dados.texto, fimDeResposta: false }, em).estado;
    } else if (e.tipo === "desenho" && !e.dados.imagem_url && typeof e.dados.grafo === "string") {
      const agora = em + 3_000;
      const r = await analisar({ llm, kit, problema, log: () => {} }, estado, {
        sessao_id: "replay", fase: estado.fase, grafo: e.dados.grafo, mudancas: String(e.dados.mudancas ?? ""),
        conversa_recente: conversa.slice(-6), perguntas_feitas: perguntas, imagem_url: null, parado_ha_s: 3,
      }, agora);
      estado = r.estado;
      const a = r.resposta;
      console.log(`\n${String(s).padStart(4)} s  ${estado.fase}  ${a.status.toUpperCase()}  (${r.diagnostico.origem}, ${r.diagnostico.ms ?? "?"} ms${r.diagnostico.ajustes.length ? `, ${r.diagnostico.ajustes.join(",")}` : ""})`);
      console.log(`        mudou: ${String(e.dados.mudancas ?? "").split("\n").slice(0, 3).join(" | ").slice(0, 160)}`);
      if (a.pergunta) console.log(`        PERGUNTA: ${a.pergunta}\n        elementos: ${a.elementos.join(",") || "-"}  visual: ${JSON.stringify(a.visual ?? [])}`);
      for (const o of a.observacoes) console.log(`        obs ${o.sinal} ${o.criterio}: ${o.evidencia}`);
      if (a.status !== "ok" && estado.plin === "PLIN_PENDENTE") {
        estado = transicionar(estado, { tipo: "PLIN_CLICADO" }, agora + 2_000).estado;
        conversa.push({ quem: "agente", texto: a.pergunta! });
        perguntas++;
        respostaEm = agora + 22_000;
      }
    }
  }
  console.log(`\nPerguntas da análise: ${perguntas}. Observações no livro: ${estado.observacoes.length}.`);
}

void main();
