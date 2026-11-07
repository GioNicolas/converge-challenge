// Máquina de estados da entrevista: as fases e, dentro delas, o ciclo do plin.
// Função pura (sem React, sem tempo real): recebe o estado, o evento e o horário, devolve o novo estado.
//
// Fases:  AGUARDANDO → APRESENTACAO → REQUISITOS → ALTO_NIVEL → APROFUNDAMENTO → FECHAMENTO → ENCERRADA
// Plin:   LIVRE → PLIN_PENDENTE (análise devolveu dúvida) → PERGUNTA_ATIVA (candidato clicou) → LIVRE
import type { Fase, RespostaAnalise } from "@/lib/sessao/cliente";

export type CicloPlin = "LIVRE" | "PLIN_PENDENTE" | "PERGUNTA_ATIVA";

export type PerguntaAtiva = RespostaAnalise & { numero: number };

export type EstadoEntrevista = {
  fase: Fase;
  faseIniciadaEm: number | null;
  plin: CicloPlin;
  /** A dúvida esperando o clique do candidato. */
  perguntaPendente: RespostaAnalise | null;
  /** A dúvida pendente veio do botão de demonstração (um "ok" da análise não a cancela). */
  pendenteDeDemo: boolean;
  /** A pergunta que o candidato está respondendo. */
  perguntaAtiva: PerguntaAtiva | null;
  perguntasFeitas: number;
  /** A pergunta de encerramento (do FECHAMENTO) já foi feita? Ela é única. */
  perguntaFinalFeita: boolean;
  /** Quando o candidato terminou a última resposta (o intervalo entre perguntas conta daqui). */
  ultimaRespostaEm: number | null;
};

export type EventoEntrevista =
  | { tipo: "COMECAR" }
  | { tipo: "APRESENTACAO_TERMINOU" }
  | { tipo: "CANDIDATO_DESENHOU" }
  | { tipo: "TEMPO_DA_FASE_ACABOU" }
  | { tipo: "ANALISE_RECEBIDA"; resposta: RespostaAnalise }
  /** Só para demonstração: põe uma dúvida pendente ignorando fase, intervalo e limite. */
  | { tipo: "PLIN_DEMO"; resposta: RespostaAnalise }
  | { tipo: "PLIN_CLICADO" }
  | { tipo: "RESPOSTA_TERMINOU" }
  /** O candidato disse "pronto"/"terminei" no alto nível: segue para o aprofundamento sem esperar. */
  | { tipo: "CANDIDATO_CONCLUIU" }
  | { tipo: "ENCERRAR" };

export type Regras = {
  intervaloEntrePerguntasMs: number;
  maxPerguntas: number;
};

export const REGRAS_PADRAO: Regras = {
  intervaloEntrePerguntasMs: 60_000,
  maxPerguntas: 5,
};

/** Tempo mínimo em ALTO_NIVEL antes de aceitar o sinal de prontidão do cérebro. */
export const MIN_ALTO_NIVEL_MS = 30_000;

const PROXIMA_FASE: Partial<Record<Fase, Fase>> = {
  APRESENTACAO: "REQUISITOS",
  REQUISITOS: "ALTO_NIVEL",
  ALTO_NIVEL: "APROFUNDAMENTO",
  APROFUNDAMENTO: "FECHAMENTO",
  FECHAMENTO: "ENCERRADA",
};

/**
 * Que tipos de plin cada fase aceita. Requisitos só aceita `duvida` (o convite para quem fica em silêncio no começo).
 * O fechamento aceita uma única dúvida: a pergunta de encerramento ("o que mudaria com mais tempo?").
 */
const PLINS_DA_FASE: Partial<Record<Fase, RespostaAnalise["status"][]>> = {
  REQUISITOS: ["duvida"],
  ALTO_NIVEL: ["duvida", "redirecionar", "dica"],
  APROFUNDAMENTO: ["duvida", "dica", "redirecionar"],
  FECHAMENTO: ["duvida"],
};

export function estadoInicial(): EstadoEntrevista {
  return {
    fase: "AGUARDANDO",
    faseIniciadaEm: null,
    plin: "LIVRE",
    perguntaPendente: null,
    pendenteDeDemo: false,
    perguntaAtiva: null,
    perguntasFeitas: 0,
    perguntaFinalFeita: false,
    ultimaRespostaEm: null,
  };
}

/** Vale a pena rodar uma análise agora? (Analisar não é interromper: só decide se pode virar plin depois.) */
export function podeAnalisar(estado: EstadoEntrevista) {
  const fasesQueAnalisam: Fase[] = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];
  return fasesQueAnalisam.includes(estado.fase) && estado.plin !== "PERGUNTA_ATIVA";
}

/** Esta resposta da análise pode virar plin agora? */
export function aceitaPlin(
  estado: EstadoEntrevista,
  resposta: RespostaAnalise,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
) {
  if (resposta.status === "ok" || !resposta.pergunta) return false;
  if (!PLINS_DA_FASE[estado.fase]?.includes(resposta.status)) return false;
  if (estado.plin === "PERGUNTA_ATIVA") return false;
  // A pergunta de encerramento fica fora do limite de 5 e do intervalo de 60s, mas é uma só.
  if (estado.fase === "FECHAMENTO") return !estado.perguntaFinalFeita;
  if (estado.perguntasFeitas >= regras.maxPerguntas) return false;
  if (
    estado.ultimaRespostaEm !== null &&
    agora - estado.ultimaRespostaEm < regras.intervaloEntrePerguntasMs
  ) {
    return false;
  }
  return true;
}

function mudarFase(estado: EstadoEntrevista, fase: Fase, agora: number): EstadoEntrevista {
  return { ...estado, fase, faseIniciadaEm: agora };
}

export function transicionar(
  estado: EstadoEntrevista,
  evento: EventoEntrevista,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): EstadoEntrevista {
  if (estado.fase === "ENCERRADA") return estado;

  switch (evento.tipo) {
    case "COMECAR":
      return estado.fase === "AGUARDANDO" ? mudarFase(estado, "APRESENTACAO", agora) : estado;

    case "APRESENTACAO_TERMINOU":
      return estado.fase === "APRESENTACAO" ? mudarFase(estado, "REQUISITOS", agora) : estado;

    case "CANDIDATO_DESENHOU":
      // Começar a desenhar encerra a fase de requisitos.
      return estado.fase === "REQUISITOS" ? mudarFase(estado, "ALTO_NIVEL", agora) : estado;

    case "TEMPO_DA_FASE_ACABOU": {
      const proxima = PROXIMA_FASE[estado.fase];
      if (!proxima) return estado;
      const novo = mudarFase(estado, proxima, agora);
      return proxima === "ENCERRADA"
        ? { ...novo, plin: "LIVRE", perguntaPendente: null, perguntaAtiva: null }
        : novo;
    }

    case "ANALISE_RECEBIDA": {
      const { resposta } = evento;
      let novo = estado;
      if (aceitaPlin(estado, resposta, agora, regras)) {
        // Uma dúvida nova substitui a pendente: a mais recente é a mais relevante.
        novo = { ...estado, plin: "PLIN_PENDENTE", perguntaPendente: resposta, pendenteDeDemo: false };
      } else if (resposta.status === "ok" && estado.plin === "PLIN_PENDENTE" && !estado.pendenteDeDemo) {
        // O candidato resolveu sozinho antes de clicar: a dúvida pendente perdeu o sentido.
        novo = { ...estado, plin: "LIVRE", perguntaPendente: null };
      }
      // O cérebro sinalizou que o alto nível está feito: avança sem esperar o relógio (que vira só o teto).
      if (
        resposta.avancar_fase === true &&
        estado.fase === "ALTO_NIVEL" &&
        estado.plin !== "PERGUNTA_ATIVA" &&
        estado.faseIniciadaEm !== null &&
        agora - estado.faseIniciadaEm >= MIN_ALTO_NIVEL_MS
      ) {
        novo = mudarFase(novo, "APROFUNDAMENTO", agora);
      }
      return novo;
    }

    case "CANDIDATO_CONCLUIU":
      return estado.fase === "ALTO_NIVEL" && estado.plin !== "PERGUNTA_ATIVA"
        ? mudarFase(estado, "APROFUNDAMENTO", agora)
        : estado;

    case "PLIN_DEMO":
      if (estado.fase === "AGUARDANDO" || estado.plin === "PERGUNTA_ATIVA") return estado;
      return { ...estado, plin: "PLIN_PENDENTE", perguntaPendente: evento.resposta, pendenteDeDemo: true };

    case "PLIN_CLICADO": {
      if (estado.plin !== "PLIN_PENDENTE" || !estado.perguntaPendente) return estado;
      const numero = estado.perguntasFeitas + 1;
      return {
        ...estado,
        plin: "PERGUNTA_ATIVA",
        perguntaAtiva: { ...estado.perguntaPendente, numero },
        perguntaPendente: null,
        // O convite de REQUISITOS (silêncio inicial) não gasta a cota de perguntas do agente.
        perguntasFeitas: estado.fase === "REQUISITOS" ? estado.perguntasFeitas : numero,
        perguntaFinalFeita: estado.perguntaFinalFeita || estado.fase === "FECHAMENTO",
      };
    }

    case "RESPOSTA_TERMINOU": {
      if (estado.plin !== "PERGUNTA_ATIVA") return estado;
      const livre: EstadoEntrevista = {
        ...estado,
        plin: "LIVRE",
        perguntaAtiva: null,
        ultimaRespostaEm: agora,
      };
      // Atingiu o limite de perguntas no aprofundamento: vai para o fechamento.
      return livre.fase === "APROFUNDAMENTO" && livre.perguntasFeitas >= regras.maxPerguntas
        ? mudarFase(livre, "FECHAMENTO", agora)
        : livre;
    }

    case "ENCERRAR":
      return {
        ...mudarFase(estado, "ENCERRADA", agora),
        plin: "LIVRE",
        perguntaPendente: null,
        perguntaAtiva: null,
      };
  }
}
