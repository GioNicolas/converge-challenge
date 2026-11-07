/**
 * Sessões da pré-entrevista, em memória.
 *
 * O store fica em `globalThis` para sobreviver ao hot reload do `next dev`. Não é banco: se o
 * servidor reiniciar, as sessões somem. Só as configs finais também vão para `data/configs/`.
 *
 * Extração em segundo plano: a cada fala da recrutadora roda `extrair` + `avaliarCobertura`.
 * Se chegar fala nova durante uma rodada, nada roda em paralelo: ao terminar, roda uma rodada
 * extra com a transcrição mais recente (as falas acumuladas viram uma rodada só).
 */
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { InterviewConfig } from "@/lib/contracts";
import type { Classificacao, Vaga } from "./classificador";
import { aplicarCobertura, avaliarCobertura, topicosDo } from "./cobertura";
import { ErroExtracao, extrair } from "./extrator";
import { ErroChat, houveFallback } from "./llm";
import { diff, registrarEvento, type EventoLog, type MudancaCampo, type NovoEvento } from "./log";
import { criarRascunho, type Rascunho, type Turno } from "./rascunho";

export interface Sessao {
  id: string;
  criadaEm: number;
  vaga: Vaga;
  /** Classificação do Jev, guardada para a abertura do agente e para a tela. */
  classificacao: Classificacao;
  rascunho: Rascunho;
  transcricao: Turno[];
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
  topicos: Array<{ id: string; pergunta: string; sugestao: string; cobertura: number; coberto: boolean }>;
  /** Ids dos tópicos ainda não cobertos, na ordem de prioridade. */
  faltando: string[];
  status: Sessao["status"];
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

/** Cria a sessão com o rascunho inicial (tudo pendente) e grava os dois primeiros eventos. */
export function criarSessao(vaga: Vaga, classificacao: Classificacao, criadaEm: number): Sessao {
  // Com cobertura vazia, todos os tópicos entram em `pendencias`.
  const rascunho = aplicarCobertura(criarRascunho(vaga, classificacao), {});
  const sessao: Sessao = {
    id: randomUUID(),
    criadaEm,
    vaga,
    classificacao,
    rascunho,
    transcricao: [],
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
      `confirmar=[${classificacao.confirmar.join(", ")}]`,
    ms: classificacao.usage.ms,
    provedor: "typesafe",
    model: classificacao.model,
    dados: {
      request: classificacao.request,
      answers: classificacao.answers,
      focusScores: classificacao.focusScores,
      focus: classificacao.focus,
      confirmar: classificacao.confirmar,
      rascunhoInicial: rascunho,
    },
  });
  return sessao;
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

/** Tira a última fala da transcrição (usado quando a resposta do agente falha, para a recrutadora reenviar). */
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
    const ext = await extrair(antes, transcricao);
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
    const cob = await avaliarCobertura(ext.rascunho, transcricao);
    const faltando = cob.faltando.map((t) => t.id);
    registrarEvento(sessao, {
      tipo: "cobertura",
      resumo: `faltando: ${faltando.join(", ") || "nada"}`,
      ms: cob.ms,
      provedor: "typesafe",
      model: cob.model,
      dados: {
        versaoTranscricao,
        request: cob.request,
        answers: cob.answers,
        usage: cob.usage,
        cobertura: cob.cobertura,
        faltando,
      },
    });

    const novo = aplicarCobertura(ext.rascunho, cob.cobertura);
    sessao.rascunho = novo;
    const mudancas = diff(antes, novo);
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

/** Espera a extração em curso terminar (com limite). Usado antes de finalizar. */
export async function aguardarExtracao(sessao: Sessao, limiteMs = 60_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (sessao.status.extraindo && Date.now() < fim) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function estadoDaSessao(sessao: Sessao): EstadoSessao {
  const { classificacao } = sessao;
  return {
    id: sessao.id,
    criadaEm: sessao.criadaEm,
    vaga: sessao.vaga,
    classificacao: {
      mode: classificacao.mode,
      seniority: classificacao.seniority,
      focusScores: classificacao.focusScores,
      focus: classificacao.focus,
      confirmar: classificacao.confirmar,
      usage: classificacao.usage,
      model: classificacao.model,
    },
    transcricao: sessao.transcricao,
    rascunho: sessao.rascunho,
    topicos: topicosDo(sessao.rascunho).map((t) => ({
      id: t.id,
      pergunta: t.pergunta,
      sugestao: t.sugestao,
      cobertura: sessao.rascunho.cobertura[t.id] ?? 0,
      coberto: !sessao.rascunho.pendencias.includes(t.id),
    })),
    faltando: sessao.rascunho.pendencias,
    status: sessao.status,
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
