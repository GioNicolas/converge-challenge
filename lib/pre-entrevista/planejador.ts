/**
 * Planejador da conversa: o código decide o próximo passo da Totti, e o modelo só escreve a fala.
 *
 * `proximoPasso` é função pura: recebe o foco, a cobertura, os sinais e o que já foi perguntado,
 * e devolve um `Passo`. Regras:
 *  - um tópico é perguntado no máximo duas vezes (a pergunta inicial e um follow-up);
 *  - follow-up só quando a última resposta foi genérica (`resposta_vaga`);
 *  - cada mudança de foco (e cada área ainda sem definição depois de uma mudança) é perguntada uma vez;
 *  - o resumo vem quando não há mais o que perguntar; depois dele, a Totti só resume de novo se ela pedir mudança.
 */
import type { FocusArea } from "@/lib/contracts";
import { areasEmJogo, LIMIAR } from "./cobertura";
import type { Foco } from "./rascunho";

/** Quantas vezes um tópico pode ser perguntado: a pergunta inicial e um follow-up. */
export const MAX_PERGUNTAS_POR_TOPICO = 2;
/** Depois de tantos resumos, a Totti para de pedir revisão e encerra. */
export const MAX_RESUMOS = 3;

export interface AprofundarPasso {
  tipo: "aprofundar";
  area: FocusArea;
  /** `inicial`: pergunta o que separa o ótimo do fraco. `vaga`: follow-up depois de resposta genérica. */
  motivo: "inicial" | "vaga";
}

export type Passo =
  | { tipo: "confirmar_inicio" }
  | AprofundarPasso
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
  | { tipo: "encerrar" };

/** O que o planejador guarda entre turnos. */
export interface PlanoEstado {
  /** Sinais do último turno (quer/dispensa por área, resposta vaga, aprovação do resumo). */
  sinais: Record<string, number>;
  /** Quantas vezes cada tópico já foi perguntado (`confirmou_inicio`, `criterio_<area>`). */
  perguntasPorTopico: Record<string, number>;
  /** Áreas que já entraram numa confirmação de mudança de foco ou numa dúvida. */
  mudancasPerguntadas: FocusArea[];
  /** Último passo que a Totti executou. */
  ultimoPasso?: Passo;
  /** Quantos resumos já foram falados. */
  resumos: number;
}

export function planoInicial(): PlanoEstado {
  return { sinais: {}, perguntasPorTopico: {}, mudancasPerguntadas: [], resumos: 0 };
}

/** Estado completo para decidir: o plano mais o foco e a cobertura do rascunho. */
export interface EstadoPlanejamento extends PlanoEstado {
  focus: Foco[];
  cobertura: Record<string, number>;
}

const criterio = (area: FocusArea) => `criterio_${area}`;

/** Último aprofundamento feito, direto ou emendado numa confirmação de mudança. */
function ultimoAprofundamento(passo: Passo | undefined): AprofundarPasso | undefined {
  if (passo?.tipo === "aprofundar") return passo;
  if (passo?.tipo === "confirmar_mudanca_foco") return passo.proximo;
  return undefined;
}

/**
 * Próximo aprofundamento: follow-up da última resposta genérica, ou a área que ela mais pediu
 * (depois pelo peso no foco) que ainda não foi perguntada.
 */
function aprofundarPasso(e: EstadoPlanejamento, emJogo: FocusArea[]): AprofundarPasso | undefined {
  const coberto = (id: string) => (e.cobertura[id] ?? 0) >= LIMIAR;
  const perguntas = (id: string) => e.perguntasPorTopico[id] ?? 0;
  const sinal = (id: string) => e.sinais[id] ?? 0;

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
  const candidatas = emJogo
    .filter((a) => !coberto(criterio(a)) && perguntas(criterio(a)) === 0)
    .sort((a, b) => Number(pedida(b)) - Number(pedida(a)) || peso(b) - peso(a));
  return candidatas[0] ? { tipo: "aprofundar", area: candidatas[0], motivo: "inicial" } : undefined;
}

/** Decide o próximo passo. Função pura. */
export function proximoPasso(e: EstadoPlanejamento): Passo {
  const coberto = (id: string) => (e.cobertura[id] ?? 0) >= LIMIAR;
  const perguntas = (id: string) => e.perguntasPorTopico[id] ?? 0;
  const sinal = (id: string) => e.sinais[id] ?? 0;
  const emJogo = areasEmJogo(e.focus, e.sinais);
  const focoAtual = e.focus.map((f) => f.area);
  const jaPerguntadas = new Set(e.mudancasPerguntadas);

  // 1. Ela aprovou o resumo: acabou.
  if (e.resumos > 0 && sinal("aprovou_resumo") >= LIMIAR) return { tipo: "encerrar" };

  // 2. Mudança de foco que ainda não foi confirmada.
  const entra = emJogo.filter((a) => !focoAtual.includes(a) && !jaPerguntadas.has(a));
  const sai = focoAtual.filter((a) => !emJogo.includes(a) && !jaPerguntadas.has(a));
  // Área do foco que ela ainda não definiu: sem critério e sem sinal de querer ou dispensar.
  const indecisa = (a: FocusArea) =>
    emJogo.includes(a) && !coberto(criterio(a)) && sinal(`quer_${a}`) < LIMIAR && sinal(`dispensa_${a}`) < LIMIAR;

  if (entra.length + sai.length > 0) {
    // Áreas indecisas ainda não perguntadas: a mudança deixa dúvida, e a Totti pergunta uma vez.
    const duvida = focoAtual.filter((a) => indecisa(a) && perguntas(`duvida_${a}`) === 0);
    const proximo = duvida.length === 0 ? aprofundarPasso(e, emJogo) : undefined;
    return { tipo: "confirmar_mudanca_foco", entra, sai, duvida, ...(proximo ? { proximo } : {}) };
  }

  // 2b. Depois de uma mudança, quando a área que entrou já foi tratada, pergunta de novo as dúvidas que ficaram.
  const entrou = emJogo.filter((a) => !focoAtual.includes(a));
  const entradaTratada = entrou.every((a) => coberto(criterio(a)) || perguntas(criterio(a)) > 0);
  const reperguntar = focoAtual.filter((a) => indecisa(a) && perguntas(`duvida_${a}`) === 1);
  if (e.mudancasPerguntadas.length > 0 && entradaTratada && reperguntar.length > 0) {
    return { tipo: "confirmar_mudanca_foco", entra: [], sai: [], duvida: reperguntar };
  }

  // 3. Início sem confirmação: uma nova tentativa, só antes do primeiro resumo.
  if (e.resumos === 0 && !coberto("confirmou_inicio") && perguntas("confirmou_inicio") < MAX_PERGUNTAS_POR_TOPICO) {
    return { tipo: "confirmar_inicio" };
  }

  // 4. Aprofundar: follow-up da resposta genérica, ou a próxima área.
  const aprofundar = aprofundarPasso(e, emJogo);
  if (aprofundar) return aprofundar;

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
    case "confirmar_mudanca_foco":
      mudancas = [...new Set<FocusArea>([...mudancas, ...passo.entra, ...passo.sai])];
      for (const a of passo.duvida) contar(`duvida_${a}`);
      if (passo.proximo) contar(criterio(passo.proximo.area));
      break;
    case "resumo_final":
      resumos += 1;
      break;
  }
  return { ...p, perguntasPorTopico: perguntas, mudancasPerguntadas: mudancas, resumos, ultimoPasso: passo };
}

/** Descrição curta do passo, para o log e a tela. */
export function descreverPasso(passo: Passo): string {
  switch (passo.tipo) {
    case "confirmar_inicio":
      return "confirmar_inicio";
    case "aprofundar":
      return `aprofundar ${passo.area} (${passo.motivo})`;
    case "confirmar_mudanca_foco": {
      const partes = [`entra=[${passo.entra.join(",")}]`, `sai=[${passo.sai.join(",")}]`, `duvida=[${passo.duvida.join(",")}]`];
      return `confirmar_mudanca_foco ${partes.join(" ")}${passo.proximo ? ` + ${descreverPasso(passo.proximo)}` : ""}`;
    }
    case "resumo_final":
      return passo.revisao ? "resumo_final (revisão)" : "resumo_final";
    case "encerrar":
      return "encerrar";
  }
}
