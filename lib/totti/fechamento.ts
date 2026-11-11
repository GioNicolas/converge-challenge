// O fechamento da entrevista do Totti único: uma sequência só, igual no live coding e no quadro.
//
//   anuncio → perguntas_finais → ultima_palavra → despedida → encerrada
//
// A sala diz quando algo aconteceu (ele concluiu, o tempo está acabando, ele pediu para encerrar), entrega as
// perguntas que ainda valem a pena e a leitura de cada turno (lib/totti/turno.ts). Este módulo decide a etapa e a
// fala: o anúncio na mesma fala da primeira pergunta, uma pergunta por vez sem esperar análise nem ritmo, a última
// palavra e a despedida. Nenhuma fala daqui manda o candidato continuar o código ou o desenho.
// Funções puras e estado serializável: o quadro guarda no estado da sessão, o live coding na sessão em memória.
// Este arquivo não importa nada de `lib/agente` nem de `lib/agents`: as salas é que importam daqui.
import { falaNaoRepetida, perguntaJaFeita, reacaoNeutra, semConviteDeSeguir } from "./guardas";
import { frasesDe, normalizar, type Sala } from "./texto";
import type { LeituraDoTurno } from "./turno";

export const ETAPAS_DO_FECHAMENTO = ["anuncio", "perguntas_finais", "ultima_palavra", "despedida", "encerrada"] as const;
export type EtapaDoFechamento = (typeof ETAPAS_DO_FECHAMENTO)[number];

/** Por que o fechamento começou. */
export type GatilhoDoFechamento = "concluiu" | "tempo" | "pediu_encerrar";

/** Uma pergunta que a sala ainda gostaria de fazer antes de encerrar. */
export type PerguntaFinal = {
  pergunta: string;
  /** Maior sai primeiro. Sem prioridade, vale a ordem em que a sala entregou. */
  prioridade?: number;
  /** De onde veio (ponto pendente, critério sem evidência, pergunta da análise). Só para o log da sala. */
  origem?: string;
  /** O gesto da sala que acompanha a pergunta (linhas ou marcas). O núcleo não lê: só devolve junto com a fala. */
  apontar?: unknown;
};

/** O fechamento em andamento. Só dados: pode ir para o banco e voltar. */
export type EstadoFechamento = {
  etapa: EtapaDoFechamento;
  gatilho: GatilhoDoFechamento;
  sala: Sala;
  /** As perguntas finais que ainda faltam, na ordem em que saem. */
  fila: PerguntaFinal[];
  /** A pergunta final que o Totti fez e que espera resposta. */
  atual: PerguntaFinal | null;
  /** A pergunta atual já teve o seu aprofundamento (ou o seu esclarecimento): a próxima resposta avança. */
  aprofundou: boolean;
  /** As perguntas finais que já foram feitas. */
  feitas: string[];
  /** A última palavra já recebeu um assunto novo: ela só volta uma vez. */
  voltouDaUltimaPalavra: boolean;
  /** O que o Totti disse durante o fechamento, da mais antiga para a mais nova. */
  ditas: string[];
};

export type PassoDoFechamento = {
  /** O que o Totti diz agora ("" quando ele continua ouvindo). */
  fala: string;
  /** A etapa depois deste passo. */
  etapa: EtapaDoFechamento;
  /** A fala é a despedida: a sala espera o áudio terminar e encerra. */
  encerrar: boolean;
  /** O estado para guardar. */
  estado: EstadoFechamento;
  /** O gesto da pergunta que acabou de sair, se a sala mandou um. */
  apontar?: unknown;
};

// ---------------------------------------------------------------------------------------------------------------
// Quando começa
// ---------------------------------------------------------------------------------------------------------------

/** Faltando isto, a entrevista entra em fechamento mesmo que ele não tenha dito que terminou. */
export const TEMPO_PARA_FECHAR_MS = 3 * 60_000;
/** Quanto uma pergunta final leva, contando a resposta e a reação. */
export const TEMPO_POR_PERGUNTA_FINAL_MS = 60_000;
/** O que a última palavra e a despedida precisam. */
export const RESERVA_PARA_A_DESPEDIDA_MS = 45_000;
export const MAX_PERGUNTAS_FINAIS = 4;

/** O que a sala sabe dizer sobre o momento, para o núcleo decidir se é hora de fechar. */
export type SinalDeFechamento = {
  /** Ele pediu para encerrar a entrevista. */
  pediuEncerrar?: boolean;
  /** A leitura do turno marcou que ele terminou. */
  concluiu?: boolean;
  /** Quantas vezes ele já tinha dito que terminou, antes desta. */
  conclusoesAntes?: number;
  /** O material está pronto: no live coding, o código roda (ou é a etapa final); no quadro, o caminho principal está desenhado. */
  materialPronto?: boolean;
  /** Quanto falta para o fim da entrevista. Ausente: a sala não sabe. */
  tempoRestanteMs?: number;
};

/**
 * É hora de fechar? Pedido para encerrar vai direto à despedida. "Terminei" com o material pronto fecha na primeira
 * vez; sem ele, na segunda (na primeira o Totti ainda tem o que perguntar sobre o que falta). Tempo acabando fecha
 * de qualquer jeito.
 */
export function gatilhoDoFechamento(sinal: SinalDeFechamento): GatilhoDoFechamento | null {
  if (sinal.pediuEncerrar) return "pediu_encerrar";
  if (sinal.concluiu && (sinal.materialPronto || (sinal.conclusoesAntes ?? 0) >= 1)) return "concluiu";
  if (sinal.tempoRestanteMs !== undefined && sinal.tempoRestanteMs <= TEMPO_PARA_FECHAR_MS) return "tempo";
  return null;
}

/** Quantas perguntas finais cabem no tempo que resta (sem saber o tempo, o máximo). */
export function perguntasQueCabem(tempoRestanteMs: number | undefined): number {
  if (tempoRestanteMs === undefined) return MAX_PERGUNTAS_FINAIS;
  const cabem = Math.floor((tempoRestanteMs - RESERVA_PARA_A_DESPEDIDA_MS) / TEMPO_POR_PERGUNTA_FINAL_MS);
  return Math.max(0, Math.min(MAX_PERGUNTAS_FINAIS, cabem));
}

/**
 * A fila das perguntas finais: as candidatas da sala, pela prioridade (e, no empate, pela ordem em que vieram), sem
 * as que ele já ouviu e sem repetir entre si, na quantidade que cabe no tempo.
 */
export function escolherPerguntasFinais(candidatas: PerguntaFinal[], tempoRestanteMs?: number, perguntasJaFeitas: string[] = []): PerguntaFinal[] {
  const ordenadas = candidatas
    .map((c, i) => ({ c: { ...c, pergunta: c.pergunta.trim() }, i }))
    .filter(({ c }) => c.pergunta)
    .sort((a, b) => (b.c.prioridade ?? 0) - (a.c.prioridade ?? 0) || a.i - b.i)
    .map(({ c }) => c);
  const escolhidas: PerguntaFinal[] = [];
  const quantas = perguntasQueCabem(tempoRestanteMs);
  for (const c of ordenadas) {
    if (escolhidas.length >= quantas) break;
    if (perguntaJaFeita(c.pergunta, [...perguntasJaFeitas, ...escolhidas.map((e) => e.pergunta)])) continue;
    escolhidas.push(c);
  }
  return escolhidas;
}

/**
 * Começa o fechamento. Pedido para encerrar vai direto à despedida; os outros gatilhos começam pelo anúncio. A
 * primeira fala sai do `proximoPasso` (sem leitura, ou com a do turno em que ele disse que terminou).
 */
export function iniciarFechamento(inicio: {
  sala: Sala;
  gatilho: GatilhoDoFechamento;
  /** As perguntas que a sala ainda faria, da mais importante para a menos. */
  candidatas?: PerguntaFinal[];
  tempoRestanteMs?: number;
  /** O que o candidato já ouviu nesta entrevista (para não perguntar de novo). */
  perguntasJaFeitas?: string[];
}): EstadoFechamento {
  const direto = inicio.gatilho === "pediu_encerrar";
  return {
    etapa: direto ? "despedida" : "anuncio",
    gatilho: inicio.gatilho,
    sala: inicio.sala,
    fila: direto ? [] : escolherPerguntasFinais(inicio.candidatas ?? [], inicio.tempoRestanteMs, inicio.perguntasJaFeitas),
    atual: null,
    aprofundou: false,
    feitas: [],
    voltouDaUltimaPalavra: false,
    ditas: [],
  };
}

/**
 * Ele voltou a desenhar ou a codar de verdade durante o fechamento (quem mede o "de verdade" é a sala): o fechamento
 * é suspenso e a entrevista volta ao normal. Na despedida já não há volta.
 */
export function aoVoltarATrabalhar(estado: EstadoFechamento): EstadoFechamento | null {
  return estado.etapa === "despedida" || estado.etapa === "encerrada" ? estado : null;
}

// ---------------------------------------------------------------------------------------------------------------
// As falas fixas
// ---------------------------------------------------------------------------------------------------------------

const ANUNCIO = {
  concluiu: { um: "Beleza. Só preciso fechar um ponto com você antes de encerrar.", varios: "Beleza. Só preciso fechar uns pontos com você antes de encerrar." },
  tempo: { um: "O nosso tempo está acabando. Só preciso fechar um ponto com você antes de encerrar.", varios: "O nosso tempo está acabando. Só preciso fechar uns pontos com você antes de encerrar." },
};
const ULTIMA_PALAVRA = "Era isso da minha parte. Quer acrescentar alguma coisa antes de encerrar?";
const ULTIMA_PALAVRA_SEM_PERGUNTAS = { concluiu: "Por mim, era isso. Quer acrescentar alguma coisa antes de encerrar?", tempo: "O nosso tempo está acabando. Quer acrescentar alguma coisa antes de encerrar?" };
const VOLTA_DA_ULTIMA_PALAVRA = "Mais alguma coisa antes de encerrar?";
const ACOLHIMENTOS = ["Tranquilo.", "Sem problema."];

/** A despedida, a mesma nas duas salas: agradece e diz de onde vem o retorno. Sem nota, sem elogio, sem prazo. */
export const DESPEDIDAS = [
  "Então a gente encerra por aqui. Obrigado pelo seu tempo e pela conversa. O retorno vem de quem está cuidando do processo.",
  "Fechamos por aqui. Obrigado por ter participado. Quem está cuidando do processo entra em contato com você.",
  "Encerramos por aqui, então. Obrigado pela conversa de hoje. O retorno chega por quem está cuidando do processo.",
];

// ---------------------------------------------------------------------------------------------------------------
// O que a fala do candidato mostra, sem modelo
// ---------------------------------------------------------------------------------------------------------------

/** Resposta curta que não traz assunto novo ("nada", "pode", "não quero", "já falei tudo"), ou o pedido de encerrar. */
export function aceitaEncerrar(fala: string): boolean {
  const t = normalizar(fala);
  if (!t) return false;
  if (/\b(encerr\w*|finaliz\w*|fech\w*)\b/.test(t)) return true;
  if (t.split(" ").length > 8) return false;
  return /^(nada|nao|pode|sim|isso|so isso|e isso|ok|beleza|tranquilo|claro|quero nao|por mim)\b/.test(t) || /\b(nada|ja falei|terminei|acabei|e isso)\b/.test(t);
}

/** O que alguém diz enquanto monta a resposta, sem dizer nada ainda. */
const SO_ENCHIMENTO = /^(h+m+|hu+m+|a+h+|e+h+|e|bom|entao|pera|perai|espera|calma|aqui|tipo|assim|olha)$/;

/**
 * Ele ainda está montando a resposta ("hmm, deixa eu pensar"): o Totti espera em vez de passar para a próxima. Só
 * conta a fala que é inteira de quem pensa; qualquer palavra com conteúdo ("hmm, não sei") já é uma resposta.
 */
export function aindaPensando(fala: string): boolean {
  const t = normalizar(fala);
  if (!t) return false;
  const resto = t.replace(/\bdeixa eu (pensar|ver|lembrar)( aqui| um pouco)?\b/g, " ").replace(/\b(so )?um (segundo|minuto|instante|momento)\b/g, " ");
  return resto.split(/\s+/).filter(Boolean).every((palavra) => SO_ENCHIMENTO.test(palavra));
}

// ---------------------------------------------------------------------------------------------------------------
// A máquina de estados
// ---------------------------------------------------------------------------------------------------------------

function passo(estado: EstadoFechamento, fala: string, mudancas: Partial<EstadoFechamento> = {}, apontar?: unknown): PassoDoFechamento {
  const novo: EstadoFechamento = { ...estado, ...mudancas, ditas: fala ? [...estado.ditas, fala] : estado.ditas };
  return { fala, etapa: novo.etapa, encerrar: novo.etapa === "encerrada" && fala !== "", estado: novo, ...(apontar !== undefined ? { apontar } : {}) };
}

/** Continua ouvindo: nada muda. */
const esperar = (estado: EstadoFechamento): PassoDoFechamento => ({ fala: "", etapa: estado.etapa, encerrar: false, estado });

/** A despedida, sozinha ou depois de uma resposta curta ao que ele acrescentou. */
function despedir(estado: EstadoFechamento, antes = ""): PassoDoFechamento {
  const despedida = DESPEDIDAS[(estado.feitas.length + estado.ditas.length) % DESPEDIDAS.length];
  return passo(estado, [antes, despedida].filter(Boolean).join(" "), { etapa: "encerrada", atual: null, fila: [] });
}

/**
 * O que sobra da fala do modelo para usar como reação entre duas perguntas: sem a pergunta dele, sem convite para
 * seguir com o material e só a primeira frase (a pergunta que vem depois é a do fechamento).
 */
function reacaoDe(leitura: LeituraDoTurno | null | undefined): string {
  if (!leitura?.responder) return "";
  const semPergunta = frasesDe(semConviteDeSeguir(leitura.texto)).filter((f) => !f.trim().endsWith("?"));
  return (semPergunta[0] ?? "").trim();
}

/** A resposta do modelo a um assunto que ele trouxe: inteira, só sem pergunta nova e sem convite para seguir. */
function respostaDe(leitura: LeituraDoTurno | null | undefined): string {
  if (!leitura?.responder) return "";
  return frasesDe(semConviteDeSeguir(leitura.texto)).filter((f) => !f.trim().endsWith("?")).join(" ").trim();
}

/** Sai a próxima pergunta da fila, com a reação na frente; sem fila, a última palavra. */
function avancar(estado: EstadoFechamento, antes: string): PassoDoFechamento {
  const [proxima, ...resto] = estado.fila;
  if (!proxima) {
    const fecho = estado.feitas.length ? ULTIMA_PALAVRA : ULTIMA_PALAVRA_SEM_PERGUNTAS[estado.gatilho === "tempo" ? "tempo" : "concluiu"];
    return passo(estado, [antes, fecho].filter(Boolean).join(" "), { etapa: "ultima_palavra", atual: null, fila: [], aprofundou: false });
  }
  return passo(
    estado, [antes, proxima.pergunta].filter(Boolean).join(" "),
    { etapa: "perguntas_finais", atual: proxima, fila: resto, aprofundou: false, feitas: [...estado.feitas, proxima.pergunta] },
    proxima.apontar,
  );
}

/**
 * O próximo passo do fechamento. `leitura` é a leitura do turno que acabou de acontecer (já com as travas da fala
 * aplicadas pela sala) e `falaDoCandidato`, o que ele disse; sem turno (o fechamento acabou de começar, ou a sala só
 * quer a despedida), os dois ficam de fora. Com `tempoRestanteMs`, a fila encolhe para caber no que resta.
 */
export function proximoPasso(
  estado: EstadoFechamento,
  leitura?: LeituraDoTurno | null,
  falaDoCandidato = "",
  opcoes: { tempoRestanteMs?: number } = {},
): PassoDoFechamento {
  if (estado.etapa === "encerrada") return { fala: "", etapa: "encerrada", encerrar: true, estado };
  if (estado.etapa === "despedida") return despedir(estado);
  // Pedido para encerrar no meio do fechamento: direto para a despedida.
  if (leitura?.encerrar) return despedir(estado);

  const atual: EstadoFechamento = opcoes.tempoRestanteMs === undefined ? estado
    : { ...estado, fila: estado.fila.slice(0, perguntasQueCabem(opcoes.tempoRestanteMs)) };
  const soltou = leitura?.intencao === "nao_sabe" || leitura?.intencao === "pulou";

  if (atual.etapa === "anuncio") {
    if (!atual.fila.length) return avancar(atual, "");
    const anuncio = ANUNCIO[atual.gatilho === "tempo" ? "tempo" : "concluiu"][atual.fila.length === 1 ? "um" : "varios"];
    return avancar(atual, anuncio);
  }

  // Daqui para baixo o passo responde a um turno do candidato.
  if (!leitura && !falaDoCandidato.trim()) return esperar(atual);
  if (!soltou && aindaPensando(falaDoCandidato)) return esperar(atual);

  if (atual.etapa === "perguntas_finais") {
    // "Não sei" ou "pula": aceita com leveza e avança.
    if (soltou) return avancar(atual, reacaoDe(leitura) || falaNaoRepetida(ACOLHIMENTOS, atual.ditas));
    // Um aprofundamento por pergunta, no máximo: a continuação que o modelo emendou, ou a resposta a uma dúvida dele
    // sobre a pergunta. Depois disso, a resposta seguinte avança.
    const continua = leitura?.responder && (leitura.perguntou || leitura.intencao === "perguntou");
    const continuacao = continua && !atual.aprofundou ? semConviteDeSeguir(leitura.texto) : "";
    if (continuacao) return passo(atual, continuacao, { aprofundou: true });
    return avancar(atual, reacaoDe(leitura) || reacaoNeutra(atual.ditas));
  }

  // Última palavra: resposta curta, "não" ou "pode" vai para a despedida.
  if (aceitaEncerrar(falaDoCandidato)) return despedir(atual);
  // Assunto novo recebe uma resposta e volta para a última palavra, uma vez só.
  const resposta = respostaDe(leitura) || reacaoNeutra(atual.ditas);
  if (atual.voltouDaUltimaPalavra) return despedir(atual, resposta);
  return passo(atual, `${resposta} ${VOLTA_DA_ULTIMA_PALAVRA}`, { voltouDaUltimaPalavra: true });
}
