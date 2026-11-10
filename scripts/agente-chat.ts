// Harness de texto do cérebro: você é o candidato, no terminal.
//   npx tsx scripts/agente-chat.ts [--kit demo] [--fake]
// Comandos: /grafo <arquivo>, /fase X, /tick, /tempo <segundos>, /plin, /estado, /ajuda, /sair.
// Texto livre: fala do candidato (vai para o `perguntar`, ou é a resposta do plin ativo).
import "./_gasto";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { analisar, type DepsAnalisar } from "../lib/agente/analisar";
import { carregarKit } from "../lib/agente/kits";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { criarClienteFalso, type LlmCliente } from "../lib/agente/llm/cliente";
import { perguntar } from "../lib/agente/perguntar";
import {
  criteriosSemEvidencia,
  estadoInicial,
  transicionar,
  type Efeito,
  type EstadoSessao,
  type EventoSessao,
} from "../lib/agente/sessao/estado";
import { FASES, type Fase, type PedidoAnalise } from "../lib/agente/sessao/tipos";

function carregarEnvLocal() {
  for (const nome of [".env.local", ".env"]) {
    if (!existsSync(nome)) continue;
    for (const linha of readFileSync(nome, "utf8").split(/\r?\n/)) {
      const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/** LLM de mentira com regras simples sobre o grafo (para rodar sem chave). */
function llmFalsoDoHarness(): LlmCliente {
  return criarClienteFalso((args) => {
    if (args.nomeSchema === "resposta_entrevistador") {
      const fala = (args.mensagens.at(-1)?.content ?? "").toLowerCase();
      if (/acesso|leitura|escala|tr[aá]fego/.test(fala))
        return { responder: true, texto: "Uns 4 mil acessos por segundo, com picos de 40 mil.", requisito: "Leitura: ~4 mil/s (picos de 40 mil)" };
      if (/guardar|reten|tempo/.test(fala))
        return { responder: true, texto: "Cinco anos por padrão.", requisito: "Retenção: 5 anos" };
      return { responder: true, texto: "Pode assumir o que achar razoável, só me diz o que assumiu.", requisito: null };
    }
    const din = args.sistema.dinamico ?? "";
    const grafo = din.split("<grafo>")[1] ?? "";
    const temCache = /redis|cache/i.test(grafo);
    const pg = grafo.match(/^- \[([a-z]\d*)\] [^\n]*postgres/im)?.[1];
    if (!temCache && pg) {
      return {
        status: "duvida",
        pergunta: "Com a leitura cem vezes maior que a escrita, o que protege esse banco?",
        nota: "Leitura 100x: gargalo?",
        elementos: [pg],
        degrau: 1,
        observacoes: [{ criterio: "escalabilidade", sinal: "negativo", espontaneo: false, evidencia: "banco único sem cache" }],
      };
    }
    return {
      status: "ok", pergunta: null, nota: null, elementos: [], degrau: null,
      observacoes: temCache ? [{ criterio: "escalabilidade", sinal: "positivo", espontaneo: true, evidencia: "cache na leitura" }] : [],
    };
  });
}

function diffGrafo(antes: string, depois: string): { texto: string; ids: string[] } {
  const a = new Set(antes.split("\n").filter(Boolean));
  const b = new Set(depois.split("\n").filter(Boolean));
  const novas = [...b].filter((l) => !a.has(l));
  const removidas = [...a].filter((l) => !b.has(l));
  const ids = [...novas, ...removidas].map((l) => l.match(/^- \[([^\]]+)\]/)?.[1]).filter((x): x is string => !!x);
  return { texto: [...novas.map((l) => `+ ${l.replace(/^- /, "")}`), ...removidas.map((l) => `- ${l.replace(/^- /, "")}`)].join("\n"), ids };
}

async function main() {
  const args = process.argv.slice(2);
  const falso = args.includes("--fake");
  const kitId = args[args.indexOf("--kit") + 1] && args.includes("--kit") ? args[args.indexOf("--kit") + 1] : "demo";
  const kit = carregarKit(kitId);
  if (!kit) throw new Error(`Kit desconhecido: ${kitId}`);
  const problema = kit.problemas[0];

  carregarEnvLocal();
  if (!falso && !process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY não encontrada (ambiente ou .env.local). Defina a chave ou rode com --fake.");
    process.exit(1);
  }
  const llm = falso ? llmFalsoDoHarness() : criarClientePrincipal();
  const deps: DepsAnalisar = { llm, kit, problema, log: (e, m) => console.log(`  [log] ${e} ${JSON.stringify(m)}`) };

  let offset = 0; // segundos simulados com /tempo
  const agora = () => Date.now() + offset * 1000;
  let estado: EstadoSessao = estadoInicial({ criterios: kit.criterios.map((c) => c.id) });
  let grafo = "COMPONENTES\nCONEXÕES";
  let requisitos: string[] = [];

  const mostrarEfeitos = (efeitos: Efeito[]) => {
    for (const e of efeitos) console.log(`  [efeito] ${JSON.stringify(e)}`);
  };
  const aplicar = (ev: EventoSessao) => {
    const t = transicionar(estado, ev, agora());
    estado = t.estado;
    mostrarEfeitos(t.efeitos);
    return t.efeitos;
  };
  const linhaEstado = () =>
    console.log(
      `\n[estado] fase=${estado.fase} plin=${estado.plin} perguntas_feitas=${estado.perguntasFeitas} sem_evidencia=[${criteriosSemEvidencia(estado).join(", ")}]`,
    );

  async function rodarAnalise(mudancas: string) {
    const pedido: PedidoAnalise = {
      sessao_id: "harness",
      fase: estado.fase,
      grafo,
      mudancas,
      conversa_recente: estado.conversa.slice(-8).map(({ quem, texto }) => ({ quem, texto })),
      perguntas_feitas: estado.perguntasFeitas,
      imagem_url: null,
    };
    const r = await analisar(deps, estado, pedido, agora());
    estado = r.estado;
    const x = r.resposta;
    console.log(`  [analise] origem=${r.diagnostico.origem} status=${x.status}${x.degrau ? ` degrau=${x.degrau}` : ""}${r.diagnostico.ms ? ` ${r.diagnostico.ms}ms` : ""}`);
    if (r.diagnostico.ajustes.length) console.log(`  [ajustes] ${r.diagnostico.ajustes.join(", ")}`);
    if (x.pergunta) console.log(`  pergunta: ${x.pergunta}\n  nota: ${x.nota}\n  elementos: ${x.elementos.join(", ") || "-"}`);
    for (const o of x.observacoes) console.log(`  obs: ${o.criterio} ${o.sinal}${o.espontaneo ? " (espontâneo)" : ""} - ${o.evidencia}`);
    mostrarEfeitos(r.efeitos);
    if (r.efeitos.some((e) => e.tipo === "PLIN_PENDENTE")) console.log("  >> PLIN: digite /plin para clicar");
  }

  // Começa direto em REQUISITOS.
  aplicar({ tipo: "COMECAR" });
  aplicar({ tipo: "APRESENTACAO_TERMINOU" });
  console.log(`\nProblema: ${problema.titulo}\n${problema.enunciado}\n(/ajuda para os comandos)`);
  linhaEstado();

  const rl = createInterface({ input: process.stdin });
  process.stdout.write("\nvocê> ");
  for await (const bruta of rl) {
    const linha = bruta.trim();
    if (!linha) continue;
    const [cmd, ...resto] = linha.split(/\s+/);

    if (cmd === "/sair") break;
    else if (cmd === "/ajuda") {
      console.log("/grafo <arquivo>  carrega o desenho e analisa\n/fase <FASE>  força a fase (" + FASES.join(", ") + ")\n/tick  passagem do tempo\n/tempo <s>  avança o relógio simulado\n/plin  clica no plin pendente\n/estado  mostra o estado\n/sair\ntexto livre = sua fala");
    } else if (cmd === "/estado") {
      console.log(JSON.stringify({ ...estado, conversa: undefined, observacoes: estado.observacoes.length }, null, 2));
    } else if (cmd === "/fase") {
      const f = resto[0]?.toUpperCase() as Fase;
      if (!FASES.includes(f)) console.log(`Fase inválida. Use: ${FASES.join(", ")}`);
      else {
        // Atalho do harness: força a fase (sem passar pela máquina de estados).
        estado = { ...estado, fase: f, faseIniciadaEm: agora(), plin: "LIVRE", perguntaPendente: null, perguntaAtiva: null };
        console.log(`  fase forçada: ${f}`);
      }
    } else if (cmd === "/tempo") {
      offset += Number(resto[0]) || 0;
      console.log(`  relógio simulado: +${offset}s`);
    } else if (cmd === "/tick") {
      aplicar({ tipo: "TICK" });
    } else if (cmd === "/plin") {
      const ef = aplicar({ tipo: "PLIN_CLICADO" });
      const p = ef.find((e) => e.tipo === "PERGUNTA_INICIADA");
      if (p?.tipo === "PERGUNTA_INICIADA") console.log(`  entrevistador: ${p.pergunta.pergunta}\n  (responda em texto livre)`);
      else console.log("  nenhum plin pendente");
    } else if (cmd === "/grafo") {
      const caminho = resolve(resto.join(" "));
      if (!resto.length || !existsSync(caminho)) console.log("Arquivo não encontrado. Ex.: /grafo scripts/exemplos/encurtador-ruim.txt");
      else {
        const novo = readFileSync(caminho, "utf8").trim();
        const d = diffGrafo(grafo, novo);
        grafo = novo;
        const ef = aplicar({ tipo: "ELEMENTOS_ALTERADOS", ids: d.ids });
        void ef;
        await rodarAnalise(d.texto || "(sem mudanças)");
      }
    } else if (estado.plin === "PERGUNTA_ATIVA") {
      const ef = aplicar({ tipo: "CANDIDATO_FALOU", texto: linha, fimDeResposta: true });
      if (ef.some((e) => e.tipo === "ANALISAR")) await rodarAnalise("(o candidato terminou de responder)");
    } else {
      const r = await perguntar(
        { llm, kit, problema, log: deps.log },
        estado,
        { fase: estado.fase, texto: linha, requisitosAtuais: requisitos, sessao_id: "harness" },
        agora(),
      );
      estado = r.estado;
      if (r.responder) console.log(`  entrevistador: ${r.texto}`);
      else console.log("  (o entrevistador fica em silêncio)");
      if (r.requisito) {
        requisitos = [...requisitos, r.requisito];
        console.log(`  [quadro de requisitos] + ${r.requisito}`);
      }
    }
    linhaEstado();
    process.stdout.write("\nvocê> ");
  }
  rl.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
