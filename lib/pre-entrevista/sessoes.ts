/**
 * Sessões da pré-entrevista, em memória.
 *
 * O store fica em `globalThis` para sobreviver ao hot reload do `next dev`. Não é banco: se o
 * servidor reiniciar, as sessões somem. Só as configs finais também vão para `data/configs/`.
 *
 * Cada fala da recrutadora passa pelo turno (`turno.ts`): cobertura síncrona, planejador, fala do Totti.
 * A extração lenta (`extrair` + cobertura) roda depois, em segundo plano. Se chegar fala nova durante
 * uma rodada, nada roda em paralelo: ao terminar, roda uma rodada extra com a transcrição mais recente
 * (as falas acumuladas viram uma rodada só).
 */
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { InterviewConfig, type FocusArea } from "@/lib/contracts";
import { classificacaoDoFormatoAtivo, type Classificacao, type Vaga } from "./classificador";
import { aplicarCobertura, areasEmJogo, avaliarCobertura, mesclarCobertura, topicosDo, ultimaFalaDoAgente } from "./cobertura";
import { type Competencia, type ResultadoCompetencias } from "./competencias";
import { ErroExtracao, extrair } from "./extrator";
import { ErroChat, houveFallback } from "./llm";
import { diff, registrarEvento, type EventoLog, type MudancaCampo, type NovoEvento } from "./log";
import { descreverPasso, planoInicial, type Passo, type PlanoEstado } from "./planejador";
import { PREFERENCIAS_PADRAO, type Preferencias } from "./preferencias";
import { criarRascunho, rascunhoNoFormatoAtivo, type Rascunho, type Turno } from "./rascunho";
import { estadoInicialEnfase, type EstadoEnfase } from "./enfase";
import { recalcularRascunho, type DetalhePeso } from "./pesos";

export interface Sessao {
  id: string;
  criadaEm: number;
  vaga: Vaga;
  /** Classificação do Jev, guardada para a abertura do Totti e para a tela. */
  classificacao: Classificacao;
  rascunho: Rascunho;
  transcricao: Turno[];
  /** Sinais e contadores do planejador (ver `planejador.ts`). */
  plano: PlanoEstado;
  /** Tom e dicas que a recrutadora pediu, atualizados a cada fala (ver `preferencias.ts`). */
  preferencias: Preferencias;
  /** Como estava o resumo da última vez que o Totti o falou. Serve para confirmar só o que mudou na revisão. */
  resumo?: { preferencias: Preferencias; duracaoMin: number };
  /** Competências-chave da vaga e se o formato verifica cada uma (ver `competencias.ts`). Não viram pergunta. */
  competencias: Competencia[];
  /** O que a vaga pede, em até 12 palavras, para a abertura da Totti (ver `competencias.ts`). Pode não existir. */
  resumoVaga?: string;
  /** O que esta entrevista não avalia: áreas deixadas para a próxima etapa e competências que o formato não verifica. */
  naoAvaliado: string[];
  /**
   * Ênfase acumulada por área, a partir de cada fala da recrutadora (ver `enfase.ts`). Dispensa e central fixam o estado.
   */
  enfaseEstado: EstadoEnfase;
  /** Fala dela que pediu o tom e fala que pediu as dicas, para o guia. */
  origemPreferencias: { tom?: string; dicas?: string };
  /** Falas dela em que disse algo eliminatório. Usadas quando o extrator não trouxe o trecho. */
  eliminatorioFalas: string[];
  /** Último detalhamento dos pesos por área (ver `pesosPelaEnfase`). */
  pesosDetalhe: DetalhePeso[];
  logs: EventoLog[];
  status: { extraindo: boolean; versaoExtraida: number };
  configFinal?: InterviewConfig;
}

/** Estado completo que a tela recebe. */
export interface EstadoSessao {
  id: string;
  criadaEm: number;
  vaga: Vaga;
  classificacao: Omit<Classificacao, "request" | "answers">;
  transcricao: Turno[];
  rascunho: Rascunho;
  topicos: Array<{ id: string; pergunta: string; cobertura: number; coberto: boolean; opcional: boolean }>;
  /** Ids dos tópicos obrigatórios das áreas em jogo ainda não cobertos. */
  faltando: string[];
  /** O que o planejador decidiu por último e o que isso significa agora. */
  planejamento: {
    passo?: Passo;
    descricaoPasso?: string;
    emJogo: FocusArea[];
    sinais: Record<string, number>;
    perguntasPorTopico: Record<string, number>;
    resumos: number;
    /** Decisão sobre a troca de formato por área (ver `planejador.ts`). */
    decisoesTradeoff: PlanoEstado["decisoesTradeoff"];
  };
  competencias: Competencia[];
  naoAvaliado: string[];
  status: Sessao["status"];
  /** Ênfase por área, se ela falou, nota da vaga e peso final (ver `pesos.ts`). */
  pesos: DetalhePeso[];
  logs: EventoLog[];
  configFinal?: InterviewConfig;
}

interface Store {
  sessoes: Map<string, Sessao>;
  configs: Map<string, InterviewConfig>;
  /** Sessões com uma fala sendo respondida. Fala nova enquanto isso é recusada (409). */
  ocupadas: Set<string>;
  /** Sessões com fala nova durante uma rodada de extração. */
  pendentes: Set<string>;
}

const CHAVE_STORE = "__preEntrevistaStore";
const globalComStore = globalThis as typeof globalThis & { [CHAVE_STORE]?: Store };
const store: Store = (globalComStore[CHAVE_STORE] ??= {
  sessoes: new Map(),
  configs: new Map(),
  ocupadas: new Set(),
  pendentes: new Set(),
});

/** Ids de config vão para um nome de arquivo: só letras, dígitos, `_` e `-`. */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,100}$/;

const trecho = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function getSessao(id: string): Sessao | undefined {
  return store.sessoes.get(id);
}

/** Marca a sessão como ocupada. Devolve false se já havia uma fala sendo respondida. */
export function ocupar(id: string): boolean {
  if (store.ocupadas.has(id)) return false;
  store.ocupadas.add(id);
  return true;
}

export function liberar(id: string): void {
  store.ocupadas.delete(id);
}

/**
 * Cria a sessão com o rascunho inicial (tudo pendente) e grava os eventos iniciais: sessão, classificação
 * e competências (com o motivo, se a extração das competências falhou).
 */
export function criarSessao(vaga: Vaga, classificacao: Classificacao, criadaEm: number, competencias: ResultadoCompetencias): Sessao {
  // Com cobertura vazia, todos os tópicos obrigatórios das áreas do foco entram em `pendencias`.
  // O formato que não está disponível vira live coding; a classificação original segue no log (ver `classificacaoDoFormatoAtivo`).
  const classificacaoUsada = classificacaoDoFormatoAtivo(classificacao);
  const rascunho = aplicarCobertura(criarRascunho(vaga, classificacaoUsada), {});
  const sessao: Sessao = {
    id: randomUUID(),
    criadaEm,
    vaga,
    classificacao: classificacaoUsada,
    rascunho,
    transcricao: [],
    plano: planoInicial(),
    preferencias: { ...PREFERENCIAS_PADRAO },
    competencias: competencias.competencias,
    resumoVaga: competencias.resumo,
    naoAvaliado: [],
    enfaseEstado: estadoInicialEnfase(),
    origemPreferencias: {},
    eliminatorioFalas: [],
    pesosDetalhe: [],
    logs: [],
    status: { extraindo: false, versaoExtraida: 0 },
  };
  store.sessoes.set(sessao.id, sessao);

  registrarEvento(sessao, { tipo: "sessao_criada", resumo: `vaga "${vaga.roleTitle}"`, dados: { vaga } });
  const confianca = (c: number) => `${Math.round(c * 100)}%`;
  registrarEvento(sessao, {
    tipo: "classificacao",
    resumo:
      `modo=${classificacao.mode.value} (${confianca(classificacao.mode.confidence)}) ` +
      `senioridade=${classificacao.seniority.value} (${confianca(classificacao.seniority.confidence)}) ` +
      `foco=${classificacao.focus.map((f) => `${f.area}:${f.weight}`).join(" ")} ` +
      `confirmar=[${classificacao.confirmar.join(", ")}]` +
      (classificacaoUsada.mode.value !== classificacao.mode.value ? ` | usado: modo=${classificacaoUsada.mode.value}` : ""),
    ms: classificacao.usage.ms,
    provedor: "typesafe",
    model: classificacao.model,
    dados: {
      request: classificacao.request,
      answers: classificacao.answers,
      focusScores: classificacao.focusScores,
      focus: classificacao.focus,
      confirmar: classificacao.confirmar,
      modoUsado: classificacaoUsada.mode.value,
      rascunhoInicial: rascunho,
    },
  });
  const nomes = competencias.competencias.map((c) => c.nome).join(", ");
  registrarEvento(sessao, {
    tipo: "competencias",
    nivel: competencias.erro ? "aviso" : "info",
    resumo: competencias.erro
      ? `sem competências (${competencias.erro})`
      : `${competencias.competencias.length} competência(s): ${nomes || "nenhuma"}` +
        (competencias.resumo ? ` | resumo: "${competencias.resumo}"` : " | sem resumo"),
    ms: competencias.ms,
    provedor: competencias.provedor,
    model: competencias.model,
    fallback: competencias.erro ? undefined : houveFallback(competencias.tentativas),
    dados: {
      mensagens: competencias.mensagens,
      respostaCrua: competencias.respostaCrua,
      competencias: competencias.competencias,
      resumo: competencias.resumo,
      erro: competencias.erro,
      tentativas: competencias.tentativas,
    },
  });
  aplicarPesosNaSessao(sessao, "início");
  return sessao;
}

/** Notas da classificação da vaga por área (0 a 3). Valem para as áreas de que ela não falou. */
function notasDaVaga(sessao: Sessao): Partial<Record<FocusArea, number>> {
  return Object.fromEntries(sessao.classificacao.focusScores.map((f) => [f.area, f.score]));
}

/**
 * Refaz o foco, os critérios, as origens e o guia a partir do estado da sessão (ênfase, falas, decisões e dispensas).
 * Chamado ao criar a sessão, depois de cada leitura síncrona e na finalização. Registra no log o que cada área pesou.
 */
export function aplicarPesosNaSessao(sessao: Sessao, origem: string): void {
  const antes = sessao.rascunho;
  const decisoes = sessao.plano.decisoesTradeoff;
  const { rascunho, detalhe } = recalcularRascunho(
    sessao.rascunho,
    { estado: sessao.enfaseEstado, notaVaga: notasDaVaga(sessao), decisoes },
    {
      preferencias: sessao.preferencias,
      origemTom: sessao.origemPreferencias.tom,
      origemDicas: sessao.origemPreferencias.dicas,
      eliminatoriosFalas: sessao.eliminatorioFalas,
      naoAvaliado: sessao.naoAvaliado,
    },
  );
  sessao.rascunho = aplicarCobertura(rascunho, rascunho.cobertura, areasEmJogo(rascunho.focus, sessao.plano.sinais, decisoes));
  sessao.pesosDetalhe = detalhe;
  const noFoco = detalhe.filter((d) => d.noFoco).map((d) => `${d.area} ${d.peso.toFixed(2)}`);
  registrarEvento(sessao, {
    tipo: "cobertura",
    resumo: `pesos (${origem}): ${noFoco.join(", ") || "nenhuma área"}`,
    dados: { origem: "pesos", leitura: origem, pesos: detalhe, diff: diff(antes, sessao.rascunho) },
  });
}

/** Acrescenta uma fala à transcrição e registra o evento correspondente. */
export function registrarFala(
  sessao: Sessao,
  turno: Turno,
  opcoes: { ms?: number; provedor?: string; model?: string; fallback?: boolean; dados?: Record<string, unknown> } = {},
): void {
  sessao.transcricao.push(turno);
  const evento: NovoEvento = {
    tipo: turno.role === "recrutadora" ? "fala_recrutadora" : "fala_agente",
    resumo: `${turno.role}: ${trecho(turno.text, 160)}`,
    dados: { texto: turno.text, ...opcoes.dados },
  };
  if (opcoes.ms !== undefined) evento.ms = opcoes.ms;
  if (opcoes.provedor !== undefined) evento.provedor = opcoes.provedor;
  if (opcoes.model !== undefined) evento.model = opcoes.model;
  if (opcoes.fallback !== undefined) evento.fallback = opcoes.fallback;
  registrarEvento(sessao, evento);
}

/** Tira a última fala da transcrição (usado quando a resposta do Totti falha, para a recrutadora reenviar). */
export function desfazerUltimaFala(sessao: Sessao): void {
  sessao.transcricao.pop();
}

function resumoDiff(mudancas: MudancaCampo[]): string {
  if (mudancas.length === 0) return "nenhuma mudança";
  const nomes = mudancas
    .slice(0, 4)
    .map((m) => m.caminho)
    .join(", ");
  return `${mudancas.length} campo(s) mudaram: ${nomes}${mudancas.length > 4 ? ", ..." : ""}`;
}

/** Substitui o rascunho inteiro (ex.: versão editada na revisão) e registra o diff. */
export function substituirRascunho(sessao: Sessao, novo: Rascunho, origem: string): void {
  const mudancas = diff(sessao.rascunho, novo);
  sessao.rascunho = novo;
  registrarEvento(sessao, {
    tipo: "rascunho_atualizado",
    resumo: `${origem}: ${resumoDiff(mudancas)}`,
    dados: { origem, diff: mudancas },
  });
}

/** O que a exceção carrega além da mensagem, para o evento `erro`. */
function detalhesDoErro(err: unknown): Record<string, unknown> {
  if (err instanceof ErroChat) return { tentativas: err.tentativas };
  if (err instanceof ErroExtracao) return { ...err.detalhes };
  return {};
}

/** Uma rodada: extrai do que foi dito até agora, mede a cobertura e aplica no rascunho. Nunca lança. */
async function rodarRodada(sessao: Sessao): Promise<void> {
  const transcricao = sessao.transcricao.slice();
  const versaoTranscricao = transcricao.length;
  const antes = sessao.rascunho;
  let etapa = "extracao";
  try {
    const ext = await extrair(antes, transcricao, { modoEscolhido: sessao.plano.modoEscolhido });
    const camposDoPatch = Object.keys(ext.patch).filter((k) => ext.patch[k as keyof typeof ext.patch] !== undefined);
    registrarEvento(sessao, {
      tipo: "extracao",
      resumo: `patch: [${camposDoPatch.join(", ") || "vazio"}] | ${ext.avisos.length} aviso(s)`,
      ms: ext.ms,
      provedor: ext.provedor,
      model: ext.model,
      fallback: houveFallback(ext.tentativas),
      dados: {
        versaoTranscricao,
        mensagens: ext.mensagens,
        respostaCrua: ext.respostaCrua,
        tentativasJson: ext.tentativasJson,
        patch: ext.patch,
        avisos: ext.avisos,
        tentativas: ext.tentativas,
      },
    });
    for (const aviso of ext.avisos) {
      registrarEvento(sessao, { tipo: "aviso", nivel: "aviso", resumo: `extrator: ${aviso}`, dados: { origem: "extracao", aviso } });
    }

    etapa = "cobertura";
    // O formato que não está disponível nesta versão nunca entra no rascunho, nem pelo extrator.
    const extraido = rascunhoNoFormatoAtivo(ext.rascunho);
    const cob = await avaliarCobertura(extraido, transcricao, { ultimaFalaAgente: ultimaFalaDoAgente(transcricao) });
    const faltando = cob.faltando.map((t) => t.id);
    registrarEvento(sessao, {
      tipo: "cobertura",
      resumo: `segundo plano | faltando: ${faltando.join(", ") || "nada"}`,
      ms: cob.ms,
      provedor: "typesafe",
      model: cob.model,
      dados: {
        origem: "segundo_plano",
        versaoTranscricao,
        request: cob.request,
        answers: cob.answers,
        usage: cob.usage,
        cobertura: cob.cobertura,
        faltando,
      },
    });

    // A cobertura síncrona (do turno) pode ter subido enquanto esta rodada rodava: mescla, sem perder nada.
    // Os sinais não entram aqui: quem decide o passo é a leitura do turno, que tem a transcrição mais recente.
    // O foco e as notas não vêm do extrator: são refeitos a partir do estado atual (ver `aplicarPesosNaSessao`).
    // Se ela disse o nível enquanto esta rodada rodava (turno em paralelo), o nível dela vale sobre o do extrator.
    const nivelDeVolta = sessao.rascunho.confirmado.seniority
      ? { seniority: sessao.rascunho.seniority, confirmado: { ...ext.rascunho.confirmado, seniority: true } }
      : {};
    sessao.rascunho = { ...extraido, ...nivelDeVolta, cobertura: mesclarCobertura(sessao.rascunho.cobertura, cob.cobertura) };
    aplicarPesosNaSessao(sessao, "segundo plano");
    const mudancas = diff(antes, sessao.rascunho);
    registrarEvento(sessao, {
      tipo: "rascunho_atualizado",
      resumo: resumoDiff(mudancas),
      dados: { versaoTranscricao, diff: mudancas },
    });
    sessao.status.versaoExtraida = versaoTranscricao;
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    registrarEvento(sessao, {
      tipo: "erro",
      nivel: "erro",
      resumo: `${etapa}: ${mensagem}`,
      dados: {
        etapa,
        versaoTranscricao,
        mensagem,
        stack: err instanceof Error ? err.stack : undefined,
        ...detalhesDoErro(err),
      },
    });
  }
}

async function rodarExtracao(sessao: Sessao): Promise<void> {
  sessao.status.extraindo = true;
  try {
    do {
      store.pendentes.delete(sessao.id);
      await rodarRodada(sessao);
    } while (store.pendentes.has(sessao.id));
  } finally {
    sessao.status.extraindo = false;
  }
}

/**
 * Agenda uma extração em segundo plano. Se já há uma rodada rodando, só marca que é preciso
 * outra ao terminar: nunca duas rodadas em paralelo na mesma sessão.
 */
export function agendarExtracao(sessao: Sessao): void {
  if (sessao.status.extraindo) {
    store.pendentes.add(sessao.id);
    return;
  }
  void rodarExtracao(sessao);
}

/** Roda a extração e espera ela terminar. Usado pelo simulador, que não tem segundo plano. */
export async function extrairAgora(sessao: Sessao): Promise<void> {
  if (sessao.status.extraindo) {
    await aguardarExtracao(sessao);
    return;
  }
  await rodarExtracao(sessao);
}

/** Espera a extração em curso terminar (com limite). Usado antes de finalizar. */
export async function aguardarExtracao(sessao: Sessao, limiteMs = 60_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (sessao.status.extraindo && Date.now() < fim) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function estadoDaSessao(sessao: Sessao): EstadoSessao {
  const { classificacao, plano } = sessao;
  const emJogo = areasEmJogo(sessao.rascunho.focus, plano.sinais, plano.decisoesTradeoff);
  return {
    id: sessao.id,
    criadaEm: sessao.criadaEm,
    vaga: sessao.vaga,
    classificacao: {
      mode: classificacao.mode,
      seniority: classificacao.seniority,
      focusScores: classificacao.focusScores,
      focus: classificacao.focus,
      nivelExplicito: classificacao.nivelExplicito,
      confirmar: classificacao.confirmar,
      usage: classificacao.usage,
      model: classificacao.model,
    },
    transcricao: sessao.transcricao,
    rascunho: sessao.rascunho,
    topicos: topicosDo(sessao.rascunho).map((t) => ({
      id: t.id,
      pergunta: t.pergunta,
      cobertura: sessao.rascunho.cobertura[t.id] ?? 0,
      coberto: !sessao.rascunho.pendencias.includes(t.id),
      opcional: t.opcional === true,
    })),
    faltando: sessao.rascunho.pendencias,
    planejamento: {
      passo: plano.ultimoPasso,
      descricaoPasso: plano.ultimoPasso ? descreverPasso(plano.ultimoPasso) : undefined,
      emJogo,
      sinais: plano.sinais,
      perguntasPorTopico: plano.perguntasPorTopico,
      resumos: plano.resumos,
      decisoesTradeoff: plano.decisoesTradeoff,
    },
    competencias: sessao.competencias,
    naoAvaliado: sessao.naoAvaliado,
    status: sessao.status,
    pesos: sessao.pesosDetalhe,
    logs: sessao.logs,
    configFinal: sessao.configFinal,
  };
}

/** Guarda a config final em memória e em `data/configs/<id>.json`. */
export async function salvarConfig(sessao: Sessao, config: InterviewConfig): Promise<void> {
  sessao.configFinal = config;
  store.configs.set(config.id, config);
  const pasta = join(process.cwd(), "data", "configs");
  await mkdir(pasta, { recursive: true });
  await writeFile(join(pasta, `${config.id}.json`), JSON.stringify(config, null, 2), "utf8");
}

/** Busca a config na memória e, se não estiver lá, no arquivo. Id inválido ou inexistente: undefined. */
export async function buscarConfig(id: string): Promise<InterviewConfig | undefined> {
  if (!ID_VALIDO.test(id)) return undefined;
  const emMemoria = store.configs.get(id);
  if (emMemoria) return emMemoria;
  try {
    const texto = await readFile(join(process.cwd(), "data", "configs", `${id}.json`), "utf8");
    const lido = InterviewConfig.safeParse(JSON.parse(texto));
    return lido.success ? lido.data : undefined;
  } catch {
    return undefined;
  }
}
