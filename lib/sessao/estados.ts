// Máquina de estados da entrevista: as fases e, dentro delas, o ciclo do plin.
// Função pura (sem React, sem tempo real): recebe o estado, o evento e o horário, devolve o novo estado.
//
// Fases:  AGUARDANDO → APRESENTACAO → REQUISITOS → ALTO_NIVEL → APROFUNDAMENTO → FECHAMENTO → ENCERRADA
// Plin:   LIVRE → PLIN_PENDENTE (análise devolveu uma pergunta, esperando a vez) → PERGUNTA_ATIVA (o Totti a disse; sem clique) → LIVRE
import { motivoDoRitmo, RITMO, type Ritmo } from "@/lib/interrupcao/politica";
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
  /** O convite único de REQUISITOS (silêncio inicial) já foi feito? Não conta na cota de perguntas. */
  conviteFeito: boolean;
  /** Quando o candidato terminou a última resposta (o intervalo entre perguntas conta do mais recente entre isto e `ultimaPerguntaEm`). */
  ultimaRespostaEm: number | null;
  /** Quando o candidato clicou na última pergunta. Opcional: estados salvos antes deste campo não o têm. */
  ultimaPerguntaEm?: number | null;
  /** Quando a dúvida pendente chegou (ela espera a próxima brecha e cai se ficar velha). */
  pendenteDesde?: number | null;
  /** Quando a entrevista começou (COMECAR) e quanto ela dura: o ritmo da política comum escala com isso. */
  iniciadaEm?: number | null;
  duracaoMin?: number;
};

export type EventoEntrevista =
  /** `duracaoMin`: soma dos tempos das fases (sem valor, a entrevista padrão de 35 min). */
  | { tipo: "COMECAR"; duracaoMin?: number }
  | { tipo: "APRESENTACAO_TERMINOU" }
  | { tipo: "CANDIDATO_DESENHOU" }
  | { tipo: "CANDIDATO_CONTINUOU"; texto?: string }
  /** O Totti acabou de responder ao candidato: a dúvida pendente fica para depois (não emenda uma na outra). */
  | { tipo: "AGENTE_RESPONDEU" }
  | { tipo: "TEMPO_DA_FASE_ACABOU" }
  | { tipo: "ANALISE_RECEBIDA"; resposta: RespostaAnalise }
  /** Só para demonstração: põe uma dúvida pendente ignorando fase, intervalo e limite. */
  | { tipo: "PLIN_DEMO"; resposta: RespostaAnalise }
  | { tipo: "PLIN_CLICADO" }
  | { tipo: "RESPOSTA_TERMINOU" }
  /** O Totti emendou uma pergunta de continuação na resposta: o mesmo fio segue ativo, com a fala nova. */
  | { tipo: "SEGUIMENTO"; pergunta: string }
  /** O candidato disse "pronto"/"terminei" no alto nível: segue para o aprofundamento sem esperar. */
  | { tipo: "CANDIDATO_CONCLUIU" }
  | { tipo: "ENCERRAR" };

/** Duração da entrevista padrão (soma de TEMPOS_PADRAO no servidor), quando o COMECAR não diz. */
export const DURACAO_PADRAO_MIN = 35;

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
    conviteFeito: false,
    ultimaRespostaEm: null,
  };
}

/** Vale a pena rodar uma análise agora? (Analisar não é interromper: só decide se pode virar plin depois.) */
export function podeAnalisar(estado: EstadoEntrevista) {
  const fasesQueAnalisam: Fase[] = ["REQUISITOS", "ALTO_NIVEL", "APROFUNDAMENTO", "FECHAMENTO"];
  return fasesQueAnalisam.includes(estado.fase) && estado.plin !== "PERGUNTA_ATIVA";
}

/**
 * Esta resposta da análise pode virar pergunta agora? Fase, ciclo e o ritmo da política comum
 * (lib/interrupcao/politica.ts), o mesmo que o servidor aplica. O MOMENTO de tomar a vez (pausa real) é do
 * useEntrevista, quando a dúvida já está pendente.
 */
export function aceitaPlin(estado: EstadoEntrevista, resposta: RespostaAnalise, agora: number) {
  if (resposta.status === "ok" || !resposta.pergunta) return false;
  if (!PLINS_DA_FASE[estado.fase]?.includes(resposta.status)) return false;
  if (estado.plin === "PERGUNTA_ATIVA") return false;
  // A pergunta de encerramento e o convite de REQUISITOS ficam fora do orçamento, mas são únicos.
  if (estado.fase === "FECHAMENTO" && estado.perguntaFinalFeita) return false;
  if (estado.fase === "REQUISITOS" && estado.conviteFeito) return false;
  const extra = estado.fase === "FECHAMENTO" || estado.fase === "REQUISITOS";
  const ritmo = ritmoDoCliente(estado, agora);
  return motivoDoRitmo(extra ? { ...ritmo, feitas: 0, marco: true } : ritmo) === null;
}

/** Situação do quadro para o ritmo da política comum (o mesmo que o servidor monta em `ritmoDoEstado`). */
export function ritmoDoCliente(estado: EstadoEntrevista, agora: number): Ritmo {
  return {
    agora,
    inicioEm: estado.iniciadaEm ?? estado.faseIniciadaEm ?? agora,
    duracaoMin: estado.duracaoMin ?? DURACAO_PADRAO_MIN,
    feitas: estado.perguntasFeitas,
    ultimaEm: estado.ultimaPerguntaEm ?? null,
    ultimaConversaFimEm: estado.ultimaRespostaEm,
    marco: marcoDeFase(estado, agora),
  };
}

/** A fase acabou de começar (aprofundamento, fechamento): é um marco. Igual a `marcoDeFase` do servidor. */
export function marcoDeFase(estado: Pick<EstadoEntrevista, "fase" | "faseIniciadaEm">, agora: number): boolean {
  return (estado.fase === "APROFUNDAMENTO" || estado.fase === "FECHAMENTO")
    && estado.faseIniciadaEm !== null && agora - estado.faseIniciadaEm < RITMO.marcoDeFaseMs;
}

function mudarFase(estado: EstadoEntrevista, fase: Fase, agora: number): EstadoEntrevista {
  return { ...estado, fase, faseIniciadaEm: agora };
}

export function transicionar(estado: EstadoEntrevista, evento: EventoEntrevista, agora: number): EstadoEntrevista {
  if (estado.fase === "ENCERRADA") return estado;

  switch (evento.tipo) {
    case "COMECAR":
      return estado.fase === "AGUARDANDO"
        ? { ...mudarFase(estado, "APRESENTACAO", agora), iniciadaEm: agora, duracaoMin: evento.duracaoMin ?? estado.duracaoMin }
        : estado;

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

    case "AGENTE_RESPONDEU":
      return estado.plin === "PLIN_PENDENTE" && !estado.pendenteDeDemo
        ? { ...estado, plin: "LIVRE", perguntaPendente: null, pendenteDesde: null }
        : estado;

    case "CANDIDATO_CONTINUOU":
      // A dúvida espera a próxima brecha na fala; só cai se já ficou para trás (a análise seguinte também pode
      // cancelá-la com "ok"). Sem isso, quem fala sem parar nunca recebia pergunta.
      // Também cai se a fala já respondeu a ela: era o "você já me perguntou isso".
      return estado.plin === "PLIN_PENDENTE" && !estado.pendenteDeDemo
        && (agora - (estado.pendenteDesde ?? agora) >= RITMO.pendenteValidaMs || falaJaCobre(estado, evento.texto))
        ? { ...estado, plin: "LIVRE", perguntaPendente: null, pendenteDesde: null }
        : estado;

    case "ANALISE_RECEBIDA": {
      const { resposta } = evento;
      let novo = estado;
      if (aceitaPlin(estado, resposta, agora)) {
        // Uma dúvida nova substitui a pendente: a mais recente é a mais relevante.
        novo = { ...estado, plin: "PLIN_PENDENTE", perguntaPendente: resposta, pendenteDeDemo: false, pendenteDesde: agora };
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
      // Número único: o convite de REQUISITOS não conta na cota, mas ocupa um número.
      const numero = estado.perguntasFeitas + (estado.conviteFeito ? 1 : 0) + 1;
      return {
        ...estado,
        plin: "PERGUNTA_ATIVA",
        perguntaAtiva: { ...estado.perguntaPendente, numero },
        perguntaPendente: null,
        ultimaPerguntaEm: agora,
        // O convite de REQUISITOS (silêncio inicial) não gasta a cota de perguntas do agente.
        perguntasFeitas: estado.fase === "REQUISITOS" ? estado.perguntasFeitas : estado.perguntasFeitas + 1,
        perguntaFinalFeita: estado.perguntaFinalFeita || estado.fase === "FECHAMENTO",
        conviteFeito: estado.conviteFeito || estado.fase === "REQUISITOS",
      };
    }

    case "SEGUIMENTO":
      if (estado.plin !== "PERGUNTA_ATIVA" || !estado.perguntaAtiva) return estado;
      return { ...estado, perguntaAtiva: { ...estado.perguntaAtiva, pergunta: evento.pergunta } };

    case "RESPOSTA_TERMINOU": {
      if (estado.plin !== "PERGUNTA_ATIVA") return estado;
      // Acabar o orçamento de perguntas não encerra o aprofundamento antes da hora: o relógio decide.
      return { ...estado, plin: "LIVRE", perguntaAtiva: null, ultimaRespostaEm: agora };
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

/** Palavras de conteúdo (4+ letras) que não dizem nada do assunto. */
const PALAVRAS_VAZIAS = new Set(["como", "você", "voce", "está", "esta", "isso", "esse", "essa", "aqui", "pensando", "para", "quando", "quer", "qual", "quais", "seria", "sobre", "mais", "tudo", "fazer", "vamos", "pode", "então", "agora"]);

function palavrasDoAssunto(texto: string): Set<string> {
  return new Set((texto.toLowerCase().match(/[a-zà-ú0-9]{4,}/g) ?? []).filter((p) => !PALAVRAS_VAZIAS.has(p)));
}

/**
 * A fala nova do candidato já cobre a pergunta pendente: ela esperava uma brecha para ser dita e, nesse meio tempo,
 * ele contou como está pensando (convite do começo, sem elementos do desenho) ou falou do mesmo assunto.
 */
export function falaJaCobre(estado: EstadoEntrevista, texto: string | undefined): boolean {
  const pergunta = estado.perguntaPendente?.pergunta;
  if (!texto || !pergunta) return false;
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  if (estado.fase === "REQUISITOS" && (estado.perguntaPendente?.elementos.length ?? 0) === 0 && palavras >= 12) return true;
  const assunto = palavrasDoAssunto(pergunta);
  if (assunto.size < 2) return false;
  const falou = palavrasDoAssunto(texto);
  return [...assunto].filter((p) => falou.has(p)).length / assunto.size >= 0.5;
}
