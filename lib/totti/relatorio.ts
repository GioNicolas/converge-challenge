// Regras de justiça do relatório, feitas UMA vez e usadas pelas duas salas (quadro e live coding): o mesmo
// Totti escreve os dois relatórios e tem de tratar o candidato do mesmo jeito. Aqui ficam o texto das regras
// (que entra nos prompts) e as funções puras que as validações usam. As rubricas, as provas aceitas e o
// formato de cada relatório continuam de cada sala.

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Texto das regras (vai aos prompts)
// ---------------------------------------------------------------------------------------------

/**
 * Bloco de regras para o prompt do relatório, em frases corridas. Cada sala o cola junto das suas regras; ele não
 * fala de rubrica, de formato nem de campo.
 */
export const REGRAS_DE_JUSTICA_DO_RELATORIO = `JUSTIÇA COM O CANDIDATO (vale para toda nota e todo texto do relatório)
- Pedir para repetir ou esclarecer ("como é?", "o que você perguntou?", "não entendi", "como assim?"), dizer que não entendeu a pergunta, corrigir o entrevistador ("não tem interrogação aí") e pedir para encerrar NÃO são evidência negativa: são neutros. Nunca viram nota baixa, ponto fraco nem frase como "teve dificuldade para acompanhar" ou "pediu repetições".
- Quando o candidato contesta algo que o entrevistador afirmou ou perguntou, considere que o entrevistador pode ter errado: confira no desenho, no código e na conversa antes de culpar o candidato. Falha do entrevistador nunca é mérito nem demérito dele.
- Comunicação se mede em falas em que ele explica ou responde algo de conteúdo. Sem nenhuma fala assim, a nota de comunicação é nula.
- Entrevista encerrada antes do tempo é fato de cobertura: diga quanto durou e o que ficou sem prova ("durou 8 de 15 minutos; 3 critérios sem prova"), sem adjetivo ("abruptamente", "desistiu") e sem peso na nota nem na recomendação.
- A justificativa de uma nota não pode contradizer a evidência que ela mesma cita.
- Nada de item genérico ("Aprofundar Requisitos e escopo."). Cada item diz o fato observado ou o que faltou observar e o que perguntar na próxima conversa.
- Nada de termo interno do sistema nos textos: ids de critério ou de elemento, nomes de etapas ou de mecanismos ("plin"). Escreva como falaria com a recrutadora.`;

// ---------------------------------------------------------------------------------------------
// Pedido de repetição ou esclarecimento
// ---------------------------------------------------------------------------------------------

/** Muletas no começo da frase, que não mudam o sentido ("ah, como é?"). */
const MULETA_INICIAL = /^(ah|ue|uai|hum|hm+|ahn|eh|e|mas|entao|olha|bom|desculpa|desculpe|perdao|licenca|pera|so um segundo)\s+/;

const SO_MULETA = /^(como|como e|como assim|como que e|hein|ha|ahn|hm+|ne|que|o que|oi|perdao|desculpa|desculpe|ue|uai|ah|hum|ok|certo|por favor|pf|pfv|de novo)$/;
const VOCE = "(?:voce|ce|vc|tu)";
const FRASES: RegExp[] = [
  // "o que você perguntou?", "o que que cê disse?"
  new RegExp(`^(?:o que|qual|que)(?: que)? ${VOCE}(?: me)?(?: acabou de)? (?:perguntou|falou|disse|quis dizer|pediu|quer dizer|falou mesmo)$`),
  // "qual é a pergunta?"
  /^(?:qual|que) (?:e|era|foi) a pergunta$/,
  /^(?:como|qual) (?:e|era) (?:que e )?a pergunta$/,
  // "não entendi", "não ouvi direito", "não entendi a pergunta"
  new RegExp(`^(?:eu )?(?:nao|n) (?:entendi|compreendi|ouvi|escutei|peguei|captei)(?: (?:direito|bem|muito bem|a pergunta|a sua pergunta|essa pergunta|isso|nada|o que ${VOCE} (?:perguntou|falou|disse|quis dizer)))?(?: (?:direito|bem|nao))?$`),
  // "pode repetir?", "repete", "repete a pergunta, por favor"
  new RegExp(`^(?:${VOCE} )?(?:pode |poderia |consegue |da pra |dava pra )?(?:repetir|repete)(?: (?:a|essa|sua|a sua) pergunta| de novo| mais uma vez| outra vez| por favor| pf| pfv)*$`),
  // "pode explicar de novo?", "explica melhor a pergunta"
  new RegExp(`^(?:${VOCE} )?(?:pode |poderia |consegue |da pra |dava pra )?(?:falar|explicar|dizer|perguntar|reformular)(?: (?:a|essa|sua|a sua) pergunta)?(?: de novo| mais uma vez| outra vez| melhor| de outro jeito| com outras palavras)(?: por favor| pf| pfv)?$`),
  // "como assim?", "como é que é?", "não é isso que eu perguntei": esclarecimento curto
  /^como (?:assim|e que e|que e isso|e isso)$/,
  // corrigir o entrevistador sobre o que está no desenho: "não tem nenhuma interrogação na ponta da seta"
  /^(?:nao|n) (?:tem|existe|ha|tinha|desenhei|coloquei|fiz)(?: (?:nenhum|nenhuma|nem|uma|um|essa|esse))? .*\b(?:interrogacao|seta|setas)\b/,
  // pedir para encerrar
  /^(?:eu )?(?:(?:quero|vou|posso|podemos|pode|preciso|gostaria de|queria) )?(?:encerrar|terminar|parar|sair|finalizar)(?: (?:a|essa|esta) (?:entrevista|sessao|conversa)| por aqui| aqui| agora| isso| por hoje)*$/,
];

/** Quantas palavras, no máximo, uma fala pode ter para ser só um pedido (fala longa sempre tem conteúdo). */
const MAX_PALAVRAS = 30;

function ehTrechoDePedido(trecho: string): boolean {
  let t = normalizar(trecho);
  if (!t) return true;
  for (let i = 0; i < 3; i++) {
    const sem = t.replace(MULETA_INICIAL, "");
    if (sem === t) break;
    t = sem;
  }
  if (!t || SO_MULETA.test(t)) return true;
  return FRASES.some((f) => f.test(t));
}

/**
 * A fala é só um pedido de repetição ou esclarecimento (ou uma correção ao entrevistador, ou um pedido para
 * encerrar)? Vale se TODOS os trechos da fala forem assim: "Como é? O que que cê perguntou?" sim; "Não entendi,
 * mas acho que usaria um cache" não, porque o segundo trecho traz conteúdo. Pura e sem estado.
 */
export function ehPedidoDeRepeticao(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo || normalizar(limpo).split(" ").length > MAX_PALAVRAS) return false;
  const trechos = limpo.split(/[.?!,;:…]+|\s[-–—]\s/).map((t) => t.trim()).filter(Boolean);
  if (trechos.length === 0) return false;
  return trechos.every(ehTrechoDePedido);
}

const PADROES_DE_CULPA: RegExp[] = [
  /\b(?:pediu|pedindo|pedidos?|solicitou)\b.{0,50}\b(?:repeti|esclarec)/,
  /\brepeticoes\b/,
  /\bdificuldade\b.{0,40}\b(?:acompanhar|entender|compreender)\b/,
  /\bnao (?:entendeu|compreendeu|conseguiu (?:entender|acompanhar)) (?:a |as |o |os )?(?:perguntas?|questionamentos?)/,
  /\babrupt/,
  /\bdesistiu\b/,
];

/**
 * O texto (escrito pelo modelo) culpa o candidato por pedir repetição ou por não acompanhar as perguntas, ou
 * descreve o encerramento com adjetivo? É o que a análise do quadro registrava como "pediu repetições sucessivas"
 * e o relatório repetia. Serve para descartar observações e frases assim.
 */
export function textoCulpaOCandidatoPorPedido(texto: string): boolean {
  const t = normalizar(texto);
  return PADROES_DE_CULPA.some((p) => p.test(t));
}

// ---------------------------------------------------------------------------------------------
// Fato de cobertura e termos internos
// ---------------------------------------------------------------------------------------------

const minutos = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

/**
 * O fato de cobertura, sem adjetivo: "A entrevista durou 8 de 15 minutos; 3 de 6 critérios ficaram sem prova."
 * Devolve null quando não há o que dizer (duração desconhecida e todos os critérios com prova).
 */
export function fatoDeCobertura(p: { duracaoMin: number | null; previstoMin: number | null; criteriosSemProva: number; totalCriterios: number }): string | null {
  const partes: string[] = [];
  if (p.duracaoMin !== null && p.previstoMin !== null && p.previstoMin > 0 && p.duracaoMin < p.previstoMin) {
    partes.push(`A entrevista durou ${minutos(p.duracaoMin)} de ${minutos(p.previstoMin)} minutos`);
  }
  if (p.criteriosSemProva > 0) {
    const sem = p.criteriosSemProva === 1
      ? `1 de ${p.totalCriterios} critérios ficou sem prova`
      : `${p.criteriosSemProva} de ${p.totalCriterios} critérios ficaram sem prova`;
    partes.push(partes.length ? sem : sem[0].toUpperCase() + sem.slice(1));
  }
  return partes.length ? `${partes.join("; ")}.` : null;
}

/**
 * Troca no texto os termos internos do time pelo que a recrutadora entende. O "plin" é o nome interno da
 * pergunta que o Totti faz; nunca aparece em tela.
 */
export function semTermosInternos(texto: string): string {
  return texto
    .replace(/\bnos plins\b/gi, "nas perguntas")
    .replace(/\baos plins\b/gi, "às perguntas")
    .replace(/\bdos plins\b/gi, "das perguntas")
    .replace(/\bos plins\b/gi, "as perguntas")
    .replace(/\bdo plin\b/gi, "da pergunta")
    .replace(/\bno plin\b/gi, "na pergunta")
    .replace(/\bao plin\b/gi, "à pergunta")
    .replace(/\bo plin\b/gi, "a pergunta")
    .replace(/\bplins\b/gi, "perguntas")
    .replace(/\bplin\b/gi, "pergunta");
}
