/**
 * Planejador da conversa: o código decide o próximo passo da Totti, e o modelo só escreve a fala.
 *
 * `proximoPasso` é função pura: recebe o foco, a cobertura, os sinais e o que já foi perguntado,
 * e devolve um `Passo`. Regras:
 *  - um tópico é perguntado no máximo duas vezes (a pergunta inicial e um follow-up);
 *  - follow-up só quando a última resposta foi genérica (`resposta_vaga`);
 *  - cada mudança de foco (e cada área ainda sem definição depois de uma mudança) é perguntada uma vez;
 *  - área que o formato atual não mede e que está em jogo: a Totti oferece a troca de formato, uma vez por área;
 *  - dúvida dela sobre a entrevista (`fez_pergunta`): a Totti responde e retoma o passo em curso, sem contar como pergunta nova;
 *  - o resumo vem quando não há mais o que perguntar; depois dele, a Totti só resume de novo se ela pedir mudança;
 *  - encerra só depois do resumo aprovado e sem pedido de mudança.
 */
import type { FocusArea, InterviewMode } from "@/lib/contracts";
import { mede, modoAlternativoQueMede } from "./catalogo";
import { areasEmJogo, LIMIAR } from "./cobertura";
import type { DecisaoTradeoff, DecisoesTradeoff, Foco } from "./rascunho";

/** Quantas vezes um tópico pode ser perguntado: a pergunta inicial e um follow-up. */
export const MAX_PERGUNTAS_POR_TOPICO = 2;
/** Depois de tantos resumos, a Totti para de pedir revisão e encerra. */
export const MAX_RESUMOS = 3;
/** Quantas dúvidas seguidas a Totti responde. Depois disso, a conversa segue pelo fluxo normal. */
export const MAX_DUVIDAS_SEGUIDAS = 2;

export interface AprofundarPasso {
  tipo: "aprofundar";
  area: FocusArea;
  /** `inicial`: pergunta o que separa o ótimo do fraco. `vaga`: follow-up depois de resposta genérica. */
  motivo: "inicial" | "vaga";
  /** Troca de formato recém-feita: a Totti confirma a troca numa frase antes da pergunta. */
  confirmaTroca?: InterviewMode;
}

/**
 * O formato atual não mede a área. A Totti diz isso e oferece 3 caminhos: trocar para `modoAlternativo`,
 * deixar para a próxima etapa do processo, ou seguir sem a área.
 */
export interface OferecerTradeoffPasso {
  tipo: "oferecer_tradeoff";
  area: FocusArea;
  modoAlternativo: InterviewMode;
}

export interface ResponderDuvidaPasso {
  tipo: "responder_duvida";
  /** Passo que estava em curso: a Totti responde a dúvida e retoma a pergunta dele. */
  retomar: Passo;
  /** Quantas dúvidas seguidas, contando esta. */
  seguidas: number;
}

export type Passo =
  | { tipo: "confirmar_inicio" }
  | AprofundarPasso
  | OferecerTradeoffPasso
  | {
      tipo: "confirmar_mudanca_foco";
      /** Áreas que entram na avaliação. */
      entra: FocusArea[];
      /** Áreas que ela disse que não importam ou pesam menos. */
      sai: FocusArea[];
      /** Áreas do foco que ficaram sem definição depois da mudança: a Totti pergunta se continuam. */
      duvida: FocusArea[];
      /** Próximo aprofundamento, emendado na mesma fala quando não há dúvida pendente. */
      proximo?: AprofundarPasso;
    }
  | { tipo: "resumo_final"; revisao?: boolean }
  | ResponderDuvidaPasso
  | { tipo: "encerrar" };

/** O que o planejador guarda entre turnos. */
export interface PlanoEstado {
  /** Sinais do último turno (quer/dispensa por área, resposta vaga, dúvida, pedido de mudança, aprovação do resumo, escolha de formato). */
  sinais: Record<string, number>;
  /** Quantas vezes cada tópico já foi perguntado (`confirmou_inicio`, `criterio_<area>`, `duvida_<area>`, `tradeoff_<area>`). */
  perguntasPorTopico: Record<string, number>;
  /** Áreas que já entraram numa confirmação de mudança de foco ou numa dúvida. */
  mudancasPerguntadas: FocusArea[];
  /** Último passo que a Totti executou. */
  ultimoPasso?: Passo;
  /** Quantos resumos já foram falados. */
  resumos: number;
  /** Decisão da recrutadora sobre cada área que o formato não mede (ver `oferecer_tradeoff`). */
  decisoesTradeoff: DecisoesTradeoff;
  /** Formato escolhido na troca. Prevalece sobre o extrator. */
  modoEscolhido?: InterviewMode;
  /** Troca feita e ainda não confirmada pela Totti: vai na próxima pergunta de aprofundamento. */
  trocaPendente?: InterviewMode;
  /** A primeira fala já foi a oferta de troca (ver `abrirConversa` em `turno.ts`). */
  tradeoffNaAbertura?: boolean;
}

export function planoInicial(): PlanoEstado {
  return { sinais: {}, perguntasPorTopico: {}, mudancasPerguntadas: [], resumos: 0, decisoesTradeoff: {} };
}

/** Estado completo para decidir: o plano mais o foco, a cobertura e o formato do rascunho. */
export interface EstadoPlanejamento extends PlanoEstado {
  focus: Foco[];
  cobertura: Record<string, number>;
  /**
   * Formato atual. Sem ele (testes antigos), nenhuma área é tratada como não medida e não há oferta de troca.
   */
  mode?: InterviewMode;
}

const criterio = (area: FocusArea) => `criterio_${area}`;

/** Último aprofundamento feito, direto, emendado numa confirmação de mudança ou antes de uma dúvida respondida. */
function ultimoAprofundamento(passo: Passo | undefined): AprofundarPasso | undefined {
  if (passo?.tipo === "responder_duvida") return ultimoAprofundamento(passo.retomar);
  if (passo?.tipo === "aprofundar") return passo;
  if (passo?.tipo === "confirmar_mudanca_foco") return passo.proximo;
  return undefined;
}

/**
 * Próximo aprofundamento: follow-up da última resposta genérica, ou a área que ela mais pediu
 * (depois pelo peso no foco) que ainda não foi perguntada. Área que o formato não mede nunca entra aqui.
 */
function aprofundarPasso(e: EstadoPlanejamento, emJogo: FocusArea[]): AprofundarPasso | undefined {
  const coberto = (id: string) => (e.cobertura[id] ?? 0) >= LIMIAR;
  const perguntas = (id: string) => e.perguntasPorTopico[id] ?? 0;
  const sinal = (id: string) => e.sinais[id] ?? 0;
  const medida = (area: FocusArea) => e.mode === undefined || mede(e.mode, area);

  const anterior = ultimoAprofundamento(e.ultimoPasso);
  if (
    anterior &&
    sinal("resposta_vaga") >= LIMIAR &&
    emJogo.includes(anterior.area) &&
    !coberto(criterio(anterior.area)) &&
    perguntas(criterio(anterior.area)) < MAX_PERGUNTAS_POR_TOPICO
  ) {
    return { tipo: "aprofundar", area: anterior.area, motivo: "vaga" };
  }

  const peso = (area: FocusArea) => e.focus.find((f) => f.area === area)?.weight ?? 0;
  const pedida = (area: FocusArea) => sinal(`quer_${area}`) >= LIMIAR;
  // Área que já teve a dúvida "continua ou fica de lado?" fica com o peso atual e não é perguntada de novo.
  const candidatas = emJogo
    .filter((a) => medida(a) && !coberto(criterio(a)) && perguntas(criterio(a)) === 0 && perguntas(`duvida_${a}`) === 0)
    .sort((a, b) => Number(pedida(b)) - Number(pedida(a)) || peso(b) - peso(a));
  return candidatas[0] ? { tipo: "aprofundar", area: candidatas[0], motivo: "inicial" } : undefined;
}

/**
 * Oferta de troca: a primeira área em jogo que o formato atual não mede, ainda sem oferta e sem decisão,
 * e que outro formato mede. Uma oferta por área, no máximo.
 */
function tradeoffPasso(e: EstadoPlanejamento, emJogo: FocusArea[]): OferecerTradeoffPasso | undefined {
  if (e.mode === undefined) return undefined;
  const modo = e.mode;
  const peso = (area: FocusArea) => e.focus.find((f) => f.area === area)?.weight ?? 0;
  const pedida = (area: FocusArea) => (e.sinais[`quer_${area}`] ?? 0) >= LIMIAR;
  const candidatas = emJogo.filter((a) => !mede(modo, a)).sort((a, b) => peso(b) - peso(a) || Number(pedida(b)) - Number(pedida(a)));
  for (const area of candidatas) {
    if ((e.perguntasPorTopico[`tradeoff_${area}`] ?? 0) > 0 || e.decisoesTradeoff[area]) continue;
    const alternativo = modoAlternativoQueMede(modo, area);
    if (alternativo) return { tipo: "oferecer_tradeoff", area, modoAlternativo: alternativo };
  }
  return undefined;
}

/**
 * Escolha da recrutadora sobre a oferta de troca, pelos sinais do último turno. Se nenhum dos três sinais passa
 * do limiar, a resposta é ambígua e vale "próxima etapa". Função pura.
 */
export function decidirTradeoff(sinais: Record<string, number>): DecisaoTradeoff {
  const opcoes: Array<[DecisaoTradeoff, number]> = [
    ["trocou", sinais.escolheu_trocar_formato ?? 0],
    ["proxima_etapa", sinais.escolheu_proxima_etapa ?? 0],
    ["seguir_sem", sinais.escolheu_seguir_sem ?? 0],
  ];
  const [melhor, probabilidade] = opcoes.reduce((a, b) => (b[1] > a[1] ? b : a));
  return probabilidade >= LIMIAR ? melhor : "proxima_etapa";
}

/** A oferta de troca que está em curso (a última, ou a que a dúvida retomou), se houver. */
export function ofertaEmCurso(plano: PlanoEstado): OferecerTradeoffPasso | undefined {
  const passo = plano.ultimoPasso?.tipo === "responder_duvida" ? plano.ultimoPasso.retomar : plano.ultimoPasso;
  return passo?.tipo === "oferecer_tradeoff" ? passo : undefined;
}

/** Decide o próximo passo. Função pura. */
export function proximoPasso(e: EstadoPlanejamento): Passo {
  const coberto = (id: string) => (e.cobertura[id] ?? 0) >= LIMIAR;
  const perguntas = (id: string) => e.perguntasPorTopico[id] ?? 0;
  const sinal = (id: string) => e.sinais[id] ?? 0;
  const emJogo = areasEmJogo(e.focus, e.sinais, e.decisoesTradeoff);
  const focoAtual = e.focus.map((f) => f.area);
  const jaPerguntadas = new Set(e.mudancasPerguntadas);
  const medida = (a: FocusArea) => e.mode === undefined || mede(e.mode, a);

  // 0. Dúvida dela sobre a entrevista: responde e retoma o passo em curso. Não conta como pergunta nova.
  const emCurso = e.ultimoPasso?.tipo === "responder_duvida" ? e.ultimoPasso.retomar : e.ultimoPasso;
  const seguidas = e.ultimoPasso?.tipo === "responder_duvida" ? e.ultimoPasso.seguidas : 0;
  if (sinal("fez_pergunta") >= LIMIAR && emCurso && emCurso.tipo !== "encerrar" && seguidas < MAX_DUVIDAS_SEGUIDAS) {
    return { tipo: "responder_duvida", retomar: emCurso, seguidas: seguidas + 1 };
  }

  // 1. Ela aprovou o resumo sem pedir mudança: acabou.
  if (e.resumos > 0 && sinal("aprovou_resumo") >= LIMIAR && sinal("pediu_mudanca") < LIMIAR) return { tipo: "encerrar" };

  // 1b. Área que o formato não mede está em jogo: a Totti oferece a troca antes de qualquer outra mudança de foco.
  const oferta = tradeoffPasso(e, emJogo);
  if (oferta) return oferta;

  // 2. Mudança de foco que ainda não foi confirmada.
  const entra = emJogo.filter((a) => !focoAtual.includes(a) && !jaPerguntadas.has(a));
  const sai = focoAtual.filter((a) => !emJogo.includes(a) && !jaPerguntadas.has(a));
  // Área do foco que ela ainda não definiu: sem critério e sem sinal de querer ou dispensar.
  const indecisa = (a: FocusArea) =>
    emJogo.includes(a) && medida(a) && !coberto(criterio(a)) && sinal(`quer_${a}`) < LIMIAR && sinal(`dispensa_${a}`) < LIMIAR;

  if (entra.length + sai.length > 0) {
    // Áreas indecisas ainda não perguntadas: a mudança deixa dúvida, e a Totti pergunta uma vez.
    const duvida = focoAtual.filter((a) => indecisa(a) && perguntas(`duvida_${a}`) === 0);
    const proximo = duvida.length === 0 ? aprofundarPasso(e, emJogo) : undefined;
    return { tipo: "confirmar_mudanca_foco", entra, sai, duvida, ...(proximo ? { proximo } : {}) };
  }

  // 2c. Depois do resumo, ela pediu mudança: a Totti confirma só a mudança e pergunta se pode finalizar.
  // Com o limite de resumos atingido, encerra mesmo assim.
  if (e.resumos > 0 && sinal("pediu_mudanca") >= LIMIAR) {
    return e.resumos < MAX_RESUMOS ? { tipo: "resumo_final", revisao: true } : { tipo: "encerrar" };
  }

  // 3. Início sem confirmação: uma nova tentativa, só antes do primeiro resumo.
  if (e.resumos === 0 && !coberto("confirmou_inicio") && perguntas("confirmou_inicio") < MAX_PERGUNTAS_POR_TOPICO) {
    return { tipo: "confirmar_inicio" };
  }

  // 4. Aprofundar: follow-up da resposta genérica, ou a próxima área. Depois de uma troca, confirma a troca antes.
  const aprofundar = aprofundarPasso(e, emJogo);
  if (aprofundar) return e.trocaPendente ? { ...aprofundar, confirmaTroca: e.trocaPendente } : aprofundar;

  // 5. Resumo: o primeiro, e depois revisões enquanto ela pedir mudança (com limite).
  if (e.resumos === 0) return { tipo: "resumo_final" };
  if (e.resumos < MAX_RESUMOS) return { tipo: "resumo_final", revisao: true };
  return { tipo: "encerrar" };
}

/** Registra no plano o passo que a Totti acabou de executar. Função pura. */
export function aplicarPasso(p: PlanoEstado, passo: Passo): PlanoEstado {
  const perguntas = { ...p.perguntasPorTopico };
  const contar = (id: string) => {
    perguntas[id] = (perguntas[id] ?? 0) + 1;
  };
  let mudancas = p.mudancasPerguntadas;
  let resumos = p.resumos;

  switch (passo.tipo) {
    case "confirmar_inicio":
      contar("confirmou_inicio");
      break;
    case "aprofundar":
      contar(criterio(passo.area));
      break;
    case "oferecer_tradeoff":
      contar(`tradeoff_${passo.area}`);
      break;
    case "confirmar_mudanca_foco":
      mudancas = [...new Set<FocusArea>([...mudancas, ...passo.entra, ...passo.sai])];
      for (const a of passo.duvida) contar(`duvida_${a}`);
      if (passo.proximo) contar(criterio(passo.proximo.area));
      break;
    case "resumo_final":
      resumos += 1;
      break;
    case "responder_duvida":
      // Responder dúvida não conta como pergunta: o passo retomado é que vai contar, se for executado.
      break;
  }
  // A troca é confirmada pela primeira fala que a carrega (ou pelo resumo, que já mostra o formato).
  const trocaPendente = passo.tipo === "resumo_final" || (passo.tipo === "aprofundar" && passo.confirmaTroca) ? undefined : p.trocaPendente;
  return { ...p, perguntasPorTopico: perguntas, mudancasPerguntadas: mudancas, resumos, ultimoPasso: passo, trocaPendente };
}

/** Descrição curta do passo, para o log e a tela. */
export function descreverPasso(passo: Passo): string {
  switch (passo.tipo) {
    case "confirmar_inicio":
      return "confirmar_inicio";
    case "aprofundar":
      return `aprofundar ${passo.area} (${passo.motivo})${passo.confirmaTroca ? ` com troca confirmada para ${passo.confirmaTroca}` : ""}`;
    case "oferecer_tradeoff":
      return `oferecer_tradeoff ${passo.area} -> ${passo.modoAlternativo}`;
    case "confirmar_mudanca_foco": {
      const partes = [`entra=[${passo.entra.join(",")}]`, `sai=[${passo.sai.join(",")}]`, `duvida=[${passo.duvida.join(",")}]`];
      return `confirmar_mudanca_foco ${partes.join(" ")}${passo.proximo ? ` + ${descreverPasso(passo.proximo)}` : ""}`;
    }
    case "resumo_final":
      return passo.revisao ? "resumo_final (revisão)" : "resumo_final";
    case "responder_duvida":
      return `responder_duvida (${passo.seguidas}ª seguida) retoma ${descreverPasso(passo.retomar)}`;
    case "encerrar":
      return "encerrar";
  }
}
