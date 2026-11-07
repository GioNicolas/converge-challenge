// Único ponto de acesso do quadro ao servidor.
// Enquanto as rotas /api/* não existem, devolve dados de mentira e usa a voz do navegador.
// Para ligar no servidor real, troque só o corpo destas funções.

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

// Só o enunciado vem ao navegador: a ficha de requisitos e a rubrica ficam no servidor.
export async function criarSessao(): Promise<Sessao> {
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

/** O último componente citado no grafo (ex.: "- [e1] Postgres (elipse)" → "e1"). */
function ultimoComponente(grafo: string) {
  const secao = grafo.split(/\nCONEX/)[0];
  const ids = [...secao.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => m[1]);
  return ids.at(-1);
}

export async function analisar(pedido: PedidoAnalise, sinal: AbortSignal): Promise<RespostaAnalise> {
  await new Promise((resolver, rejeitar) => {
    const t = setTimeout(resolver, 800 + Math.random() * 700);
    sinal.addEventListener("abort", () => {
      clearTimeout(t);
      rejeitar(new Error("cancelada"));
    });
  });
  const base = RESPOSTAS_DE_MENTIRA[proximaResposta++ % RESPOSTAS_DE_MENTIRA.length];
  const alvo = ultimoComponente(pedido.grafo);
  return { ...base, elementos: base.status !== "ok" && alvo ? [alvo] : [] };
}

// --- Linha do tempo (POST /api/sessoes/:id/eventos), de mentira por enquanto ---

export async function enviarEventos(sessaoId: string, lote: { horario: string; tipo: string; dados: unknown }[]) {
  console.debug(`[linha do tempo] ${sessaoId}: ${lote.length} evento(s)`, lote);
}

// --- Voz provisória: a síntese do próprio navegador (depois vira o /falar da ElevenLabs) ---

export function falar(texto: string): Promise<void> {
  return new Promise((resolver) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolver();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = "pt-BR";
    fala.rate = 1.05;
    const voz = speechSynthesis.getVoices().find((v) => v.lang.startsWith("pt"));
    if (voz) fala.voice = voz;
    fala.onend = () => resolver();
    fala.onerror = () => resolver();
    speechSynthesis.cancel();
    speechSynthesis.speak(fala);
  });
}

export function calar() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
}
