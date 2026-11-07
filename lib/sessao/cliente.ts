import { z } from "zod";
import type { MarcaDeFala } from "../presenca/vozSincronizada";

// Único ponto de acesso do quadro ao servidor.
// O modo de demonstração continua sendo o padrão.
export function usarServidor(): boolean {
  return process.env.NEXT_PUBLIC_USAR_SERVIDOR === "1";
}

export type Fase =
  | "AGUARDANDO"
  | "APRESENTACAO"
  | "REQUISITOS"
  | "ALTO_NIVEL"
  | "APROFUNDAMENTO"
  | "FECHAMENTO"
  | "ENCERRADA";

export type Sessao = {
  sessao_id: string;
  /** Nome da área do kit de avaliação (ex.: "system design", "marketing"). */
  area: string;
  problema: { titulo: string; enunciado: string };
  /** Duração de cada fase, em segundos. */
  tempos: Partial<Record<Fase, number>>;
};

// --- Contrato com o /analisar (divisão de tarefas, seção 4.1 e 4.2) ---

export type FalaRecente = { quem: "candidato" | "agente"; texto: string };

/** Fala em andamento na legenda: `ate` = quantos caracteres já foram falados. */
export type FalaNaTela = FalaRecente & { ate: number };

export type PedidoAnalise = {
  sessao_id: string;
  fase: Fase;
  /** O desenho em texto (conversor). */
  grafo: string;
  /** O que mudou desde a última análise. */
  mudancas: string;
  conversa_recente: FalaRecente[];
  perguntas_feitas: number;
  imagem_url: string | null;
};

export type Observacao = {
  criterio: string;
  sinal: "positivo" | "negativo" | "neutro";
  espontaneo: boolean;
  evidencia: string;
};

export type RespostaAnalise = {
  status: "ok" | "duvida" | "redirecionar" | "dica";
  /** O que a voz fala. */
  pergunta: string | null;
  /** Versão curta que o agente escreve no quadro (~40 caracteres). */
  nota: string | null;
  /** IDs (curtos, do conversor) que o agente circula. */
  elementos: string[];
  degrau: number | null;
  observacoes: Observacao[];
};

/** Valida a resposta do /analisar. Fora do formato → a análise é descartada (o gatilho tenta de novo depois). */
const EsquemaResposta = z.object({
  status: z.enum(["ok", "duvida", "redirecionar", "dica"]),
  pergunta: z.string().nullable().default(null),
  nota: z.string().nullable().default(null),
  elementos: z.array(z.string()).default([]),
  degrau: z.number().nullable().default(null),
  observacoes: z
    .array(
      z.object({
        criterio: z.string(),
        sinal: z.enum(["positivo", "negativo", "neutro"]),
        espontaneo: z.boolean(),
        evidencia: z.string(),
      }),
    )
    .default([]),
});

export function validarResposta(dados: unknown): RespostaAnalise {
  const r = EsquemaResposta.parse(dados);
  // Sem pergunta não há o que perguntar: vira "ok".
  if (r.status !== "ok" && !r.pergunta?.trim()) return { ...r, status: "ok" };
  // A nota é curta (~40 caracteres); se vier sem, usa a pergunta.
  return { ...r, nota: (r.nota?.trim() || r.pergunta || "").slice(0, 60) || null };
}

// Só o enunciado vem ao navegador: a ficha de requisitos e a rubrica ficam no servidor.
export async function criarSessao(): Promise<Sessao> {
  vozDoServidorDisponivel = true;
  if (usarServidor()) {
    const servidor = await import("./servidor");
    return servidor.criarSessao({
      avaliacaoId: process.env.NEXT_PUBLIC_AVALIACAO_ID || "demo",
      candidatoId: process.env.NEXT_PUBLIC_CANDIDATO_ID || "demo",
    });
  }
  return {
    sessao_id: "sessao-de-mentira",
    area: "system design",
    problema: {
      titulo: "Encurtador de URL",
      enunciado:
        "Projete um serviço como o bit.ly: recebe uma URL longa e devolve uma curta. Quem acessa a curta é redirecionado.",
    },
    // Tempos curtos de propósito, para testar o fluxo inteiro rápido.
    tempos: {
      REQUISITOS: 30,
      ALTO_NIVEL: 40,
      APROFUNDAMENTO: 5 * 60,
      FECHAMENTO: 60,
    },
  };
}

// --- Análise de mentira: uma lista fixa que se repete ---

const RESPOSTAS_DE_MENTIRA: Omit<RespostaAnalise, "elementos">[] = [
  { status: "ok", pergunta: null, nota: null, degrau: null, observacoes: [] },
  {
    status: "duvida",
    pergunta: "Com leitura cem vezes maior que escrita, onde fica o gargalo desse desenho?",
    nota: "Leitura 100x: gargalo?",
    degrau: null,
    observacoes: [
      { criterio: "escalabilidade", sinal: "negativo", espontaneo: false, evidencia: "banco único sem cache" },
    ],
  },
  { status: "ok", pergunta: null, nota: null, degrau: null, observacoes: [] },
  {
    status: "duvida",
    pergunta: "Como você garante que dois links nunca recebem o mesmo código?",
    nota: "Colisão de código?",
    degrau: null,
    observacoes: [],
  },
];

let proximaResposta = 0;
let proximaDemo = 0;

/** Uma dúvida pronta para demonstrar o plin, apontando para o último componente desenhado. */
export function duvidaDeDemonstracao(grafo: string): RespostaAnalise {
  const duvidas = RESPOSTAS_DE_MENTIRA.filter((r) => r.status === "duvida");
  const base = duvidas[proximaDemo++ % duvidas.length];
  const alvo = ultimoComponente(grafo);
  return validarResposta({ ...base, elementos: alvo ? [alvo] : [] });
}

/** O último componente citado no grafo (ex.: "- [e1] Postgres (elipse)" → "e1"). */
function ultimoComponente(grafo: string) {
  const secao = grafo.split(/\nCONEX/)[0];
  const ids = [...secao.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]);
  return ids.at(-1);
}

export async function analisar(pedido: PedidoAnalise, sinal: AbortSignal): Promise<RespostaAnalise> {
  if (usarServidor()) return (await import("./servidor")).analisar(pedido, sinal);
  await new Promise((resolver, rejeitar) => {
    const t = setTimeout(resolver, 800 + Math.random() * 700);
    sinal.addEventListener("abort", () => {
      clearTimeout(t);
      rejeitar(new Error("cancelada"));
    });
  });
  const base = RESPOSTAS_DE_MENTIRA[proximaResposta++ % RESPOSTAS_DE_MENTIRA.length];
  const alvo = ultimoComponente(pedido.grafo);
  return validarResposta({ ...base, elementos: base.status !== "ok" && alvo ? [alvo] : [] });
}

// --- Linha do tempo (POST /api/sessoes/:id/eventos) ---

export async function enviarEventos(sessaoId: string, lote: { horario: string; tipo: string; dados: unknown }[]) {
  if (usarServidor()) return (await import("./servidor")).enviarEventos(sessaoId, lote);
  console.debug(`[linha do tempo] ${sessaoId}: ${lote.length} evento(s)`, lote);
}

/** Fim da entrevista: o servidor gera o scorecard da recrutadora. Sem servidor, não há o que gerar. */
export async function finalizarSessao(sessaoId: string): Promise<void> {
  if (usarServidor()) return (await import("./servidor")).finalizar(sessaoId);
  console.debug(`[fim] ${sessaoId}: sem servidor, nenhum relatório gerado`);
}

// --- Síntese do navegador: demonstração e fallback do áudio remoto ---

/**
 * Fala o texto. `aoProgresso(n)` recebe quantos caracteres já foram falados (para a legenda andar junto).
 * Se a voz falhar, resolve mesmo assim: a pergunta continua escrita na legenda e no quadro.
 */
function falarNoNavegador(texto: string, aoProgresso: (caracteres: number) => void, sinal: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    let terminou = false;
    let estimativa: ReturnType<typeof setInterval> | undefined;
    let fala: SpeechSynthesisUtterance | undefined;
    const terminar = (completar = true) => {
      if (terminou) return;
      terminou = true;
      if (estimativa !== undefined) clearInterval(estimativa);
      sinal.removeEventListener("abort", cancelar);
      if (fala) fala.onend = fala.onerror = fala.onboundary = null;
      if (completar && !sinal.aborted) aoProgresso(texto.length);
      resolver();
    };
    const cancelar = () => terminar(false);
    if (sinal.aborted) return terminar(false);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return terminar();
    let comAviso = false;
    const inicio = performance.now();
    try {
      fala = new SpeechSynthesisUtterance(texto);
      fala.lang = "pt-BR";
      fala.rate = 1.05;
      const voz = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("pt"));
      if (voz) fala.voice = voz;
      estimativa = setInterval(() => {
        if (!comAviso) aoProgresso(Math.min(texto.length, Math.round(((performance.now() - inicio) / 1000) * 15)));
      }, 80);
      fala.onboundary = (e) => {
        comAviso = true;
        const fimDaPalavra = texto.indexOf(" ", e.charIndex + 1);
        aoProgresso(fimDaPalavra === -1 ? texto.length : fimDaPalavra);
      };
      fala.onend = () => terminar();
      fala.onerror = () => terminar();
      sinal.addEventListener("abort", cancelar, { once: true });
      window.speechSynthesis.speak(fala);
    } catch {
      terminar();
    }
  });
}

let controleDaVoz: AbortController | null = null;
/** Vira false quando o servidor diz que não tem voz (501): até a próxima sessão, nem tenta. */
let vozDoServidorDisponivel = true;

/** A assinatura usada pelo quadro permanece a mesma nos dois modos. */
export function falar(texto: string, aoProgresso?: (caracteres: number) => void): Promise<void> {
  return falarComMarcas(texto, [], aoProgresso);
}

export async function falarComMarcas(texto: string, marcas: MarcaDeFala[], aoProgresso?: (caracteres: number) => void): Promise<void> {
  calar();
  const controle = new AbortController();
  controleDaVoz = controle;
  const disparadas = new Set<number>();
  const marcasUnicas = marcas.map((m, indice) => ({ ...m, aoChegar: () => {
    if (controle.signal.aborted || disparadas.has(indice)) return;
    disparadas.add(indice);
    m.aoChegar();
  } }));
  const progresso = (n: number) => {
    if (!controle.signal.aborted && controleDaVoz === controle) aoProgresso?.(Math.min(texto.length, n));
  };
  try {
    if (usarServidor() && vozDoServidorDisponivel) {
      const servidor = await import("./servidor");
      try {
        const voz = await servidor.sintetizarFala(texto, controle.signal);
        if (controle.signal.aborted) return;
        const { tocarComAlinhamento } = await import("../presenca/vozSincronizada");
        await tocarComAlinhamento(voz.audio, voz.alinhamento, { aoProgresso: progresso, marcas: marcasUnicas, sinal: controle.signal });
        progresso(texto.length);
        return;
      } catch (erro) {
        if (controle.signal.aborted) return;
        if (erro instanceof servidor.ErroHttp && erro.status === 501) vozDoServidorDisponivel = false;
        console.warn("[voz] usando síntese do navegador:", erro);
      }
    }
    if (!controle.signal.aborted) {
      marcasUnicas.forEach((m) => m.aoChegar());
      await falarNoNavegador(texto, progresso, controle.signal);
    }
  } catch {
    progresso(texto.length);
  } finally {
    if (controleDaVoz === controle) controleDaVoz = null;
  }
}

export function calar() {
  controleDaVoz?.abort();
  controleDaVoz = null;
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {}
}
