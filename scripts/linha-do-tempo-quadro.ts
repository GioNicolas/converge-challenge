// Linha do tempo das interrupções no quadro (System Design): quantas vezes o Totti toma a vez sem ser chamado,
// em que fase, em que momento (pausa depois de desenhar, silêncio, fim de resposta) e se o candidato estava no meio
// de um desenho ou de uma fala. Relógio virtual: uma entrevista inteira leva só o tempo das chamadas ao LLM.
// Reproduz o navegador (gatilho de pausa e de silêncio, máquina de estados do quadro, tomada de turno) e chama a
// análise de verdade do servidor (`lib/agente/analisar.ts`), com o LLM real ou com um modelo que sempre pergunta.
//
//   npx tsx --env-file-if-exists=.env.local scripts/linha-do-tempo-quadro.ts [--llm real|sempre] [--persona normal,fluente,travado] [--duracao 35]
//
// --llm sempre: sem créditos; mostra o teto da política (o modelo quer perguntar em toda análise).
// --llm real (padrão): usa créditos (papel "quadro", ~US$ 0,0005 por análise).
import "./_gasto";
import { analisar } from "../lib/agente/analisar";
import { KIT_SYSTEM_DESIGN as kit } from "../lib/agente/kits/system-design";
import type { LlmCliente } from "../lib/agente/llm/cliente";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { escalarTempos } from "../lib/agente/plano";
import {
  estadoInicial as estadoServidorInicial,
  TEMPOS_PADRAO,
  transicionar as transicionarServidor,
  type EstadoSessao,
  type EventoSessao,
} from "../lib/agente/sessao/estado";
import type { PedidoAnalise } from "../lib/agente/sessao/tipos";
import { podeTomarTurno } from "../lib/conversa/turnos";
import type { Fase, RespostaAnalise } from "../lib/sessao/cliente";
import { contarComponentes, esperaDoEmpecilho } from "../lib/sessao/empecilho";
import { interrupcaoAtrasada, motivoDoMomento, RITMO } from "../lib/interrupcao/politica";
import { aceitaPlin, estadoInicial, marcoDeFase, podeAnalisar, ritmoDoCliente, transicionar, type EstadoEntrevista, type EventoEntrevista } from "../lib/sessao/estados";
import { LIMITE_PADRAO_MS, PAUSA_PADRAO_MS } from "../lib/sessao/gatilho";
import { deveForcarAnalise } from "../lib/sessao/silencio";
import { instantaneo, resumoDoCusto } from "./custo";

const TICK_MS = 500;
/** Tempo que o Totti leva falando uma pergunta. */
const FALA_DA_PERGUNTA_MS = 6_000;
/** O quadro dá a resposta por terminada depois desse silêncio (SILENCIO_FIM_DA_RESPOSTA_MS em useEntrevista.ts). */
const FIM_DA_RESPOSTA_MS = 7_000;
/** Chance de o Totti comentar (sem pergunta) uma fala solta do candidato, o que dispara uma análise. */
const COMENTA_DEPOIS_DA_FALA = 0.3;

const LINHAS = [
  "- [r1] Cliente (retângulo)",
  "- [r2] Load balancer (retângulo)",
  "- [s1] Cliente → Load balancer",
  "- [r3] API de encurtamento (retângulo)",
  "- [s2] Load balancer → API de encurtamento",
  "- [e1] Postgres primário (elipse)",
  "- [s3] API de encurtamento → Postgres primário \"escreve\"",
  "- [r4] Gerador de IDs (base62) (retângulo)",
  "- [s4] API de encurtamento → Gerador de IDs",
  "- [r5] Cache Redis (retângulo)",
  "- [s5] API de encurtamento → Cache Redis \"lê primeiro\"",
  "- [e2] Réplica de leitura (elipse)",
  "- [s6] Postgres primário → Réplica de leitura \"replica\"",
  "- [s7] Cache Redis → Réplica de leitura \"miss\"",
  "- [r6] Fila Kafka de cliques (retângulo)",
  "- [s8] API de encurtamento → Fila Kafka de cliques",
  "- [r7] Worker de analytics (retângulo)",
  "- [s9] Fila Kafka de cliques → Worker de analytics",
];

type Passo = { tipo: "desenha" | "fala" | "pausa"; ms: number };
interface Persona {
  nome: string;
  /** Pesos e faixas de duração (s) de cada tipo de passo. */
  passos: Record<Passo["tipo"], { peso: number; s: [number, number] }>;
  /** Quanto tempo ele fala ao responder uma pergunta. */
  respostaS: number;
}

const PERSONAS: Persona[] = [
  {
    nome: "normal",
    passos: { desenha: { peso: 0.4, s: [6, 14] }, fala: { peso: 0.3, s: [6, 15] }, pausa: { peso: 0.3, s: [4, 18] } },
    respostaS: 20,
  },
  {
    nome: "fluente",
    passos: { desenha: { peso: 0.4, s: [6, 16] }, fala: { peso: 0.5, s: [8, 20] }, pausa: { peso: 0.1, s: [2, 4] } },
    respostaS: 30,
  },
  {
    nome: "travado",
    passos: { desenha: { peso: 0.25, s: [4, 8] }, fala: { peso: 0.2, s: [4, 8] }, pausa: { peso: 0.55, s: [10, 45] } },
    respostaS: 8,
  },
];

/** Gerador determinístico (mulberry32): a mesma persona faz sempre a mesma entrevista. */
function rng(semente: number) {
  let a = semente;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Modelo que quer perguntar em toda análise (perguntas sempre diferentes, para a guarda de repetição não barrar). */
function llmSempre(): LlmCliente {
  const temas = ["consistência", "latência", "particionamento", "colisão", "expiração", "replicação", "observabilidade", "custo", "segurança", "falhas", "picos", "migração"];
  let n = 0;
  return {
    async completarJson<T>() {
      const tema = temas[n++ % temas.length];
      const dados = {
        status: "duvida",
        pergunta: `Pergunta ${n} sobre ${tema}: o que você ${["prioriza", "decide", "escolhe", "considera"][n % 4]} ${tema} ${n}?`,
        nota: tema,
        elementos: [],
        degrau: 1,
        observacoes: [],
        avancar_fase: false,
      };
      return { dados: dados as T, ms: 3_500 };
    },
  };
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export interface Interrupcao {
  t: number;
  fase: string;
  tipo: string;
  motivo: string;
  desenhando: boolean;
  texto: string;
}

export async function simularQuadro(persona: Persona, opcoes: { llm: LlmCliente; duracaoMin: number; silencioso?: boolean }) {
  const log = opcoes.silencioso ? () => {} : (l: string) => console.log(l);
  const sortear = rng(persona.nome.length * 7919);
  const tempos = escalarTempos(TEMPOS_PADRAO, opcoes.duracaoMin);
  const problema = kit.problemas[0];
  const deps = { llm: opcoes.llm, kit, problema, log: () => {} };

  let t = 0;
  let cliente: EstadoEntrevista = estadoInicial();
  let servidor: EstadoSessao = estadoServidorInicial({
    tempos,
    criterios: kit.criterios.map((c) => c.id),
    plano: { cargo: "Desenvolvedor Backend Pleno", senioridade: "pleno", tom: "amigavel", dicas: "leves", foco: [{ area: "tecnico", peso: 1 }], notas: "", duracaoMin: opcoes.duracaoMin },
  });
  const cli = (ev: EventoEntrevista) => {
    const antes = cliente.fase;
    cliente = transicionar(cliente, ev, t);
    if (cliente.fase !== antes) {
      servidor = transicionarServidor(servidor, { tipo: "SINCRONIZAR_FASE", fase: cliente.fase }, t).estado;
      log(`[${mmss(t)}] — fase ${cliente.fase}`);
      if (cliente.fase === "APROFUNDAMENTO") agendado.push({ em: t + 500, motivo: "início do aprofundamento", forcar: true });
      if (cliente.fase === "REQUISITOS") {
        ultimaAtividade = t;
        ultimoDisparoParado = 0;
      }
    }
  };
  const srv = (ev: EventoSessao) => {
    servidor = transicionarServidor(servidor, ev, t).estado;
  };

  // Navegador
  let ultimaAtividade = 0;
  let ultimaFalaEm = -10_000;
  let ultimoDesenhoEm = -10_000;
  let ultimoDisparoParado = 0;
  let falando = false;
  let agenteFalandoAte = 0;
  let ultimaFalaDoAgenteEm: number | null = null;
  let pausaEm: number | null = null;
  let versao = 0;
  let versaoAnalisada = -1;
  let desenhadas = 0;
  let desenhadasAnalisadas = 0;
  let mudancaDesde: number | null = null;
  let empecilhoFeito = false;
  let empecilhoEm = -Infinity;
  let licencaDeNovoEm = 0;
  let ultimoPedidoEmpecilho = -Infinity;
  type Rodando = { fimEm: number; resposta: RespostaAnalise; valeu: boolean; falaAoAnalisar: number; motivo: string; ajustes: string[] };
  const voo: { rodando: Rodando | null } = { rodando: null };
  let esperando: { forcar: boolean; motivo: string } | null = null;
  const agendado: { em: number; motivo: string; forcar: boolean }[] = [];
  let motivoDaPendente = "";

  // Candidato
  let passo: (Passo & { fimEm: number; proximoTraco?: number }) | null = null;
  let respondendo: { falaAte: number } | null = null;

  const interrupcoes: Interrupcao[] = [];
  const contagem = { analises: 0, querPerguntar: 0, barradasServidor: 0, barradasQuadro: 0, descartadasPorFala: 0, lentas: 0, canceladasPorFala: 0, licencas: 0 };

  const grafo = () => `COMPONENTES E CONEXÕES\n${LINHAS.slice(0, desenhadas).join("\n")}`;

  async function disparar(forcar: boolean, motivo: string): Promise<void> {
    const ocupado = !podeAnalisar(cliente) || falando || t < agenteFalandoAte;
    if (ocupado) {
      agendado.push({ em: t + 1_000, motivo, forcar });
      return;
    }
    if (voo.rodando) {
      esperando = { forcar: (esperando?.forcar ?? false) || forcar, motivo };
      return;
    }
    if (!forcar && versao === versaoAnalisada) return;
    versaoAnalisada = versao;
    mudancaDesde = null;
    const novas = LINHAS.slice(desenhadasAnalisadas, desenhadas);
    desenhadasAnalisadas = desenhadas;
    const pedido: PedidoAnalise = {
      sessao_id: `linha-${persona.nome}`,
      fase: servidor.fase,
      grafo: grafo(),
      mudancas: novas.length ? `Novo: ${novas.join("; ")}` : "(nada mudou no desenho)",
      conversa_recente: servidor.conversa.slice(-6).map(({ quem, texto }) => ({ quem, texto })),
      perguntas_feitas: cliente.perguntasFeitas,
      imagem_url: null,
      parado_ha_s: Math.round((t - ultimaAtividade) / 1000),
    };
    contagem.analises++;
    const r = await analisar(deps, servidor, pedido, t);
    const ms = r.diagnostico.ms ?? 0;
    voo.rodando = {
      fimEm: t + Math.min(ms, LIMITE_PADRAO_MS),
      resposta: r.resposta as unknown as RespostaAnalise,
      valeu: ms <= LIMITE_PADRAO_MS && r.diagnostico.origem !== "erro",
      falaAoAnalisar: ultimaFalaEm,
      motivo,
      ajustes: r.diagnostico.ajustes,
    };
    if (r.diagnostico.ajustes.includes("rebaixada_pela_politica")) contagem.barradasServidor++;
    if (r.resposta.status !== "ok" || r.diagnostico.ajustes.includes("rebaixada_pela_politica")) contagem.querPerguntar++;
    servidor = r.estado;
  }

  const fimDaEntrevista = Object.values(tempos).reduce<number>((s, x) => s + (x ?? 0), 0) * 1000 + 60_000;
  cli({ tipo: "COMECAR", duracaoMin: opcoes.duracaoMin });
  srv({ tipo: "COMECAR" });
  t += 20_000; // apresentação
  cli({ tipo: "APRESENTACAO_TERMINOU" });
  srv({ tipo: "APRESENTACAO_TERMINOU" });

  while (cliente.fase !== "ENCERRADA" && t < fimDaEntrevista) {
    t += TICK_MS;
    // Tempo da fase.
    const dur = cliente.faseIniciadaEm !== null ? tempos[cliente.fase as keyof typeof tempos] : undefined;
    if (dur !== undefined && cliente.faseIniciadaEm !== null && t - cliente.faseIniciadaEm >= dur * 1000) cli({ tipo: "TEMPO_DA_FASE_ACABOU" });
    if ((cliente.fase as Fase) === "ENCERRADA") break;

    // Candidato.
    if (cliente.plin === "PERGUNTA_ATIVA") {
      if (!respondendo && t >= agenteFalandoAte) respondendo = { falaAte: t + persona.respostaS * 1000 };
      if (respondendo) {
        if (t < respondendo.falaAte) {
          falando = true;
          ultimaFalaEm = t;
          ultimaAtividade = t;
        } else {
          falando = false;
          if (t - ultimaFalaEm >= FIM_DA_RESPOSTA_MS) {
            srv({ tipo: "CANDIDATO_FALOU", texto: "resposta", fimDeResposta: true });
            cli({ tipo: "RESPOSTA_TERMINOU" });
            respondendo = null;
            agendado.push({ em: t, motivo: "fim de resposta", forcar: true });
          }
        }
      }
    } else if (t >= agenteFalandoAte) {
      if (!passo || t >= passo.fimEm) {
        if (passo?.tipo === "fala") {
          falando = false;
          srv({ tipo: "CANDIDATO_FALOU", texto: "explicação", fimDeResposta: false });
          // A fala vai ao /perguntar; às vezes o Totti comenta sem perguntar e o quadro reanalisa logo depois.
          if (sortear() < COMENTA_DEPOIS_DA_FALA) {
            agenteFalandoAte = t + 3_000;
            ultimaFalaDoAgenteEm = t;
            cli({ tipo: "AGENTE_RESPONDEU" });
            agendado.push({ em: t + 3_000, motivo: "depois de um comentário do Totti", forcar: true });
          }
        }
        const pesos = { ...persona.passos };
        const fracao = cliente.faseIniciadaEm !== null && dur ? (t - cliente.faseIniciadaEm) / (dur * 1000) : 0;
        // Requisitos: conversa primeiro, desenha só na segunda metade. Fechamento: só conversa.
        if ((cliente.fase === "REQUISITOS" && fracao < 0.5) || cliente.fase === "FECHAMENTO") pesos.desenha = { ...pesos.desenha, peso: 0 };
        const total = pesos.desenha.peso + pesos.fala.peso + pesos.pausa.peso;
        let x = sortear() * total;
        const tipo = (["desenha", "fala", "pausa"] as const).find((k) => (x -= pesos[k].peso) < 0) ?? "pausa";
        const [a, b] = pesos[tipo].s;
        const ms = Math.round((a + sortear() * (b - a)) * 1000);
        passo = { tipo, ms, fimEm: t + ms, proximoTraco: t };
      }
      if (passo.tipo === "fala") {
        falando = true;
        ultimaFalaEm = t;
        ultimaAtividade = t;
        // Fala do candidato cancela a dúvida pendente (CANDIDATO_CONTINUOU no quadro).
        if (cliente.plin === "PLIN_PENDENTE") {
          cli({ tipo: "CANDIDATO_CONTINUOU" });
          if ((cliente.plin as string) === "LIVRE") contagem.canceladasPorFala++;
        }
      } else if (passo.tipo === "desenha" && passo.proximoTraco !== undefined && t >= passo.proximoTraco) {
        passo.proximoTraco = t + 2_500;
        if (desenhadas < LINHAS.length) desenhadas++;
        versao++;
        ultimaAtividade = t;
        ultimoDesenhoEm = t;
        if (cliente.fase !== "REQUISITOS" || desenhadas >= 2) {
          cli({ tipo: "CANDIDATO_DESENHOU" });
          srv({ tipo: "CANDIDATO_DESENHOU" });
        }
        pausaEm = t + PAUSA_PADRAO_MS;
        // Como o gatilho: desenhando sem parar, analisa mesmo assim depois da espera máxima.
        mudancaDesde ??= t;
        if (t - mudancaDesde >= RITMO.analiseMaximaSemPausaMs) {
          pausaEm = null;
          await disparar(false, "trabalho contínuo");
        }
      }
    }

    // Gatilho: pausa depois de desenhar, silêncio, pedidos agendados.
    if (pausaEm !== null && t >= pausaEm) {
      pausaEm = null;
      await disparar(false, "pausa depois de desenhar");
    }
    // A mesma regra do navegador (lib/sessao/silencio.ts, deveForcarAnalise): depois de uma fala do Totti, espera
    // SILENCIO_SEM_ACAO_S e quebra uma vez por período de silêncio.
    if (cliente.plin === "LIVRE" && deveForcarAnalise({ agora: t, fase: cliente.fase, ultimaAtividade, ultimaFalaDoAgente: ultimaFalaDoAgenteEm, ultimoDisparo: ultimoDisparoParado })) {
      ultimoDisparoParado = t;
      await disparar(true, `silêncio de ${Math.round((t - ultimaAtividade) / 1000)} s`);
    }
    const vencidos = agendado.filter((x) => x.em <= t);
    agendado.splice(0, agendado.length, ...agendado.filter((x) => x.em > t));
    // Como no gatilho: vários pedidos juntos viram um só (o último vence, forçado se algum era).
    if (vencidos.length) {
      const ultimo = vencidos[vencidos.length - 1];
      await disparar(vencidos.some((v) => v.forcar), ultimo.motivo);
    }

    // Resultado da análise em voo.
    if (voo.rodando && t >= voo.rodando.fimEm) {
      const r: Rodando = voo.rodando;
      voo.rodando = null;
      if (!r.valeu) contagem.lentas++;
      else if (ultimaFalaEm > r.falaAoAnalisar) {
        if (r.resposta.status !== "ok") contagem.descartadasPorFala++;
      } else {
        const antes = cliente.plin;
        if (r.resposta.status !== "ok" && r.resposta.pergunta && !aceitaPlin(cliente, r.resposta, t)) contagem.barradasQuadro++;
        cli({ tipo: "ANALISE_RECEBIDA", resposta: r.resposta });
        if (cliente.plin === "PLIN_PENDENTE" && antes !== "PLIN_PENDENTE") motivoDaPendente = r.motivo;
      }
      if (esperando) {
        const e: { forcar: boolean; motivo: string } = esperando;
        esperando = null;
        await disparar(e.forcar, e.motivo);
      }
    }

    // Tomada de turno: a dúvida pendente entra na primeira pausa da fala.
    const podeFalar = podeTomarTurno({ agora: t, ultimaFalaEm, falaParcial: falando, agenteFalando: t < agenteFalandoAte, aguardandoResposta: false });
    // Como no useEntrevista: só numa pausa real (sem desenhar nem falar), ou logo depois de um marco de fase.
    const parado = { maosParadasHaMs: t - ultimoDesenhoEm, falaHaMs: t - ultimaFalaEm };
    const momentoOk = motivoDoMomento({ ...parado, marco: marcoDeFase(cliente, t), esperandoHaMs: t - (cliente.pendenteDesde ?? t),
      atrasada: interrupcaoAtrasada(ritmoDoCliente(cliente, t)) }) === null;
    const respiroDaMudanca = t - empecilhoEm >= RITMO.respiroMs;
    // Como o useEntrevista: no meio do desenho, numa pausa curta, o Totti pede licença antes de perguntar.
    const desenhando = t - ultimoDesenhoEm < 12_000;
    const pausaCurta = motivoDoMomento({ ...parado, marco: true }) === null;
    let liberou = false;
    if (cliente.plin === "PLIN_PENDENTE" && podeFalar && respiroDaMudanca && desenhando && (momentoOk || pausaCurta) && t >= licencaDeNovoEm) {
      agenteFalandoAte = t + 3_000;
      contagem.licencas++;
      // Ele responde: "pode" (70%) ou "espera".
      if (sortear() < 0.7) liberou = true;
      else licencaDeNovoEm = t + 45_000;
    }
    if (cliente.plin === "PLIN_PENDENTE" && (liberou || (podeFalar && momentoOk && !desenhando && respiroDaMudanca)) && cliente.perguntaPendente) {
      const p = cliente.perguntaPendente;
      const fase = cliente.fase;
      cli({ tipo: "PLIN_CLICADO" });
      srv({ tipo: "PLIN_CLICADO" });
      agenteFalandoAte = t + FALA_DA_PERGUNTA_MS;
      ultimaFalaDoAgenteEm = t;
      passo = null;
      const i: Interrupcao = { t, fase, tipo: p.status, motivo: liberou ? `${motivoDaPendente}; com licença` : motivoDaPendente, desenhando: t - ultimoDesenhoEm < 2_000, texto: p.pergunta ?? "" };
      interrupcoes.push(i);
      log(`[${mmss(t)}] ${fase.padEnd(14)} INTERRUPÇÃO ${interrupcoes.length} (${i.tipo}; ${i.motivo}${i.desenhando ? "; NO MEIO DO DESENHO" : ""}) ${i.texto.slice(0, 90)}`);
    }

    // Mudança no problema (empecilho): uma vez, numa pausa, sem pergunta no ar.
    if (!empecilhoFeito && cliente.plin === "LIVRE" && podeFalar && motivoDoMomento(parado) === null && t - ultimoPedidoEmpecilho >= 15_000) {
      ultimoPedidoEmpecilho = t;
      const espera = esperaDoEmpecilho({
        agora: t, fase: cliente.fase, faseIniciadaEm: cliente.faseIniciadaEm, duracaoDaFaseS: tempos[cliente.fase as keyof typeof tempos],
        jaAnunciado: false, respondendoPergunta: false, componentes: contarComponentes(grafo()), ultimaFalaDoAgenteEm,
      });
      if (espera === null) {
        empecilhoFeito = true;
        empecilhoEm = t;
        agenteFalandoAte = t + 10_000;
        ultimaFalaDoAgenteEm = t;
        ultimaAtividade = t;
        passo = null;
        interrupcoes.push({ t, fase: cliente.fase, tipo: "empecilho", motivo: "mudança no problema", desenhando: t - ultimoDesenhoEm < 2_000, texto: "mudança no problema" });
        log(`[${mmss(t)}] ${cliente.fase.padEnd(14)} INTERRUPÇÃO ${interrupcoes.length} (mudança no problema)`);
      }
    }
  }
  return { persona: persona.nome, duracaoMin: opcoes.duracaoMin, interrupcoes, contagem, fim: t };
}

export function resumo(r: Awaited<ReturnType<typeof simularQuadro>>): string {
  const porFase = new Map<string, number>();
  for (const i of r.interrupcoes) porFase.set(i.fase, (porFase.get(i.fase) ?? 0) + 1);
  const gaps = r.interrupcoes.slice(1).map((i, k) => (i.t - r.interrupcoes[k].t) / 1000).sort((a, b) => a - b);
  const mediana = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
  return [
    `${r.persona} (${r.duracaoMin} min): ${r.interrupcoes.length} interrupções · ${[...porFase].map(([f, n]) => `${f} ${n}`).join(", ")}`,
    `  intervalo entre elas: mín ${gaps[0] ?? "–"} s, mediana ${mediana ?? "–"} s · no meio do desenho: ${r.interrupcoes.filter((i) => i.desenhando).length}`,
    `  análises ${r.contagem.analises}, quis perguntar ${r.contagem.querPerguntar}, barradas no servidor ${r.contagem.barradasServidor}, no quadro ${r.contagem.barradasQuadro}, descartadas por fala ${r.contagem.descartadasPorFala}, canceladas por fala ${r.contagem.canceladasPorFala}, lentas ${r.contagem.lentas}, licenças pedidas ${r.contagem.licencas}`,
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const valor = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const modo = valor("--llm") ?? "real";
  const duracaoMin = Number(valor("--duracao")) || 35;
  const nomes = valor("--persona")?.split(",");
  const resumos: string[] = [];
  for (const p of PERSONAS.filter((x) => !nomes || nomes.includes(x.nome))) {
    console.log(`\n# ${p.nome} (${modo})`);
    const antes = instantaneo();
    const r = await simularQuadro(p, { llm: modo === "sempre" ? llmSempre() : criarClientePrincipal(), duracaoMin });
    resumos.push(`${resumo(r)}\n  custo de LLM (análise do quadro; sem a fala e o relatório):\n${resumoDoCusto(antes)}`);
  }
  console.log(`\n${resumos.join("\n")}`);
}

if (process.argv[1]?.endsWith("linha-do-tempo-quadro.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => process.exit());
}
