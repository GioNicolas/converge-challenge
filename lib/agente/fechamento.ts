// O que o quadro entrega ao fechamento comum do Totti (lib/totti/fechamento.ts): as perguntas que ainda valeria a
// pena fazer antes de encerrar e o que o candidato já ouviu. A ordem, a quantidade, a deduplicação e a sequência
// (anúncio → perguntas finais → última palavra → despedida) são do núcleo. Só servidor.
import type { AcaoVisual } from "../presenca/acoesVisuais";
import type { PerguntaFinal } from "../totti/fechamento";
import { resumoDaCobertura } from "./briefing";
import { perguntaJaFeita } from "./guardas";
import type { Kit, Problema } from "./kits/tipos";
import type { EstadoSessao } from "./sessao/estado";

/** O gesto que acompanha uma pergunta final do quadro: as peças que ela cita e as marcas que a análise compôs. */
export type ApontarNoQuadro = { elementos: string[]; visual?: AcaoVisual[] };

/** Perguntas por critério que entram na frente das sugeridas do problema (o resto fica para o fim da lista). */
export const MAX_PERGUNTAS_DE_CRITERIO_NA_FRENTE = 2;

/** Requisitos só se pergunta na etapa de requisitos (a mesma regra do briefing): no fechamento não vira pergunta. */
const CRITERIO_DE_REQUISITOS = "requisitos";

const PRIORIDADE = { analise: 3, criterio: 2, problema: 1, criterio_extra: 0 } as const;

/**
 * A pergunta sobre um critério que ficou sem evidência. O nome vem da rubrica ("Dados e consistência", "Clareza da
 * interface (hierarquia, estados de erro)"): sai o parêntese, e a inicial vira minúscula quando não é sigla.
 */
export function perguntaDoCriterio(nome: string, variacao = 0): string {
  const semParentese = nome.replace(/\s*\(.*\)\s*$/, "").trim();
  const assunto = /^\p{Lu}\p{Ll}/u.test(semParentese) ? semParentese[0].toLowerCase() + semParentese.slice(1) : semParentese;
  // Duas formas, para duas perguntas de critério seguidas não soarem (nem contarem) como a mesma pergunta.
  return variacao % 2 === 0
    ? `Como você pensou a parte de ${assunto} no seu desenho?`
    : `Sobre ${assunto}: o que você levou em conta até aqui?`;
}

/** A pergunta sugerida que continua a anterior da lista ("E se ele estiver offline?"): sozinha, fica sem assunto. */
const continuaAAnterior = (pergunta: string): boolean => pergunta.trimStart().startsWith("E ");

/**
 * As candidatas a pergunta final do quadro, da mais importante para a menos:
 *   1. a pergunta da análise que esperava a vez (concreta, com a peça do desenho marcada);
 *   2. os critérios de maior peso ainda sem evidência suficiente (pelo briefing, só leitura);
 *   3. as perguntas sugeridas do problema;
 *   4. os outros critérios sem evidência.
 * O núcleo tira as que ele já ouviu e corta pelo tempo que resta.
 */
export function candidatasDoQuadro(kit: Pick<Kit, "criterios">, problema: Pick<Problema, "perguntasSugeridas">, estado: EstadoSessao, agora: number): PerguntaFinal[] {
  const candidatas: PerguntaFinal[] = [];
  const pendente = estado.perguntaPendente;
  if (pendente?.pergunta?.trim()) {
    const apontar: ApontarNoQuadro = { elementos: pendente.elementos, ...(pendente.visual ? { visual: pendente.visual } : {}) };
    candidatas.push({ pergunta: pendente.pergunta, prioridade: PRIORIDADE.analise, origem: "analise", apontar });
  }
  const semEvidencia = resumoDaCobertura(kit.criterios, estado, agora).criterios
    .filter((c) => !c.suficiente && c.id !== CRITERIO_DE_REQUISITOS)
    .sort((a, b) => b.peso - a.peso);
  semEvidencia.forEach((c, i) => candidatas.push({
    pergunta: perguntaDoCriterio(c.nome, i),
    prioridade: i < MAX_PERGUNTAS_DE_CRITERIO_NA_FRENTE ? PRIORIDADE.criterio : PRIORIDADE.criterio_extra,
    origem: `criterio:${c.id}`,
  }));
  // As sugeridas vão na ordem do problema. A que continua a anterior só vai se a anterior também puder ir: se ele já
  // ouviu a anterior, a continuação chegaria solta, sem o assunto dela.
  const jaOuvidas = perguntasJaOuvidas(estado);
  problema.perguntasSugeridas.forEach((pergunta, i) => {
    const anterior = problema.perguntasSugeridas[i - 1];
    if (continuaAAnterior(pergunta) && anterior !== undefined && perguntaJaFeita(anterior, jaOuvidas)) return;
    candidatas.push({ pergunta, prioridade: PRIORIDADE.problema, origem: "problema" });
  });
  return candidatas;
}

/** O que o candidato já ouviu de pergunta nesta entrevista: as da conversa e as da análise, com as continuações. */
export function perguntasJaOuvidas(estado: EstadoSessao): string[] {
  return [
    ...estado.conversa.filter((f) => f.quem === "agente" && f.texto.includes("?")).map((f) => f.texto),
    ...estado.perguntas.flatMap((p) => [p.pergunta, ...(p.seguimentos ?? [])]),
  ];
}
