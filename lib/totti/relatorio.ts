// Regras de justiça do relatório, feitas UMA vez e usadas pelas duas salas (quadro e live coding): o mesmo
// Totti escreve os dois relatórios e tem de tratar o candidato do mesmo jeito. Aqui ficam o texto das regras
// (que entra nos prompts) e as funções puras que as validações usam. As rubricas, as provas aceitas e o
// formato de cada relatório continuam de cada sala.
//
// Sem expressão regular de propósito: tudo aqui é feito com palavras, conjuntos e um casador de frases pequeno.

/** Minúsculas, sem acento, só letras e números separados por um espaço. */
export function normalizarParaComparar(s: string): string {
  let saida = "";
  let ultimoFoiEspaco = true; // começa true para não deixar espaço no início
  for (const ch of s.toLowerCase().normalize("NFD")) {
    const codigo = ch.codePointAt(0) ?? 0;
    if (codigo >= 0x300 && codigo <= 0x36f) continue; // acento solto (marca combinante)
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      saida += ch;
      ultimoFoiEspaco = false;
    } else if (!ultimoFoiEspaco) {
      saida += " ";
      ultimoFoiEspaco = true;
    }
  }
  return saida.endsWith(" ") ? saida.slice(0, -1) : saida;
}

/** As palavras do texto já normalizado (lista vazia se não sobrou nada). */
function palavrasDe(s: string): string[] {
  const n = normalizarParaComparar(s);
  return n === "" ? [] : n.split(" ");
}

function ehLetraOuNumero(c: string): boolean {
  return c.toLowerCase() !== c.toUpperCase() || (c >= "0" && c <= "9");
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
// Casador de frases (no lugar de expressão regular)
// ---------------------------------------------------------------------------------------------
// Um padrão é uma lista de passos sobre as palavras já normalizadas. Cada passo tem alternativas (frases separadas
// por "|") e um modo: "u" = exatamente uma delas, "o" = uma delas ou nenhuma, "r" = zero ou mais. Uma palavra que
// termina em "*" casa por prefixo ("encerr*" casa "encerrou"). O passo { max } aceita de 0 a max palavras quaisquer.

type Passo = { alts: string[][]; modo: "u" | "o" | "r" } | { max: number };

const alternativas = (s: string): string[][] => s.split("|").map((a) => a.split(" "));
const u = (s: string): Passo => ({ alts: alternativas(s), modo: "u" });
const o = (s: string): Passo => ({ alts: alternativas(s), modo: "o" });
const r = (s: string): Passo => ({ alts: alternativas(s), modo: "r" });
const ate = (max: number): Passo => ({ max });

function palavraCasa(palavra: string, molde: string): boolean {
  return molde.endsWith("*") ? palavra.startsWith(molde.slice(0, -1)) : palavra === molde;
}

function casaDesde(passos: Passo[], k: number, ws: string[], i: number, inteiro: boolean): boolean {
  if (k === passos.length) return inteiro ? i === ws.length : true;
  const p = passos[k];
  if ("max" in p) {
    for (let n = 0; n <= p.max && i + n <= ws.length; n++) {
      if (casaDesde(passos, k + 1, ws, i + n, inteiro)) return true;
    }
    return false;
  }
  if (p.modo !== "u" && casaDesde(passos, k + 1, ws, i, inteiro)) return true;
  for (const alt of p.alts) {
    if (i + alt.length > ws.length) continue;
    if (!alt.every((molde, d) => palavraCasa(ws[i + d], molde))) continue;
    if (casaDesde(passos, p.modo === "r" ? k : k + 1, ws, i + alt.length, inteiro)) return true;
  }
  return false;
}

/** O padrão casa com a fala inteira. */
const casaInteiro = (passos: Passo[], ws: string[]): boolean => casaDesde(passos, 0, ws, 0, true);

/** O padrão aparece em algum ponto da fala. */
const aparece = (passos: Passo[], ws: string[]): boolean => ws.some((_, i) => casaDesde(passos, 0, ws, i, false));

// ---------------------------------------------------------------------------------------------
// Pedido de repetição ou esclarecimento
// ---------------------------------------------------------------------------------------------

/** Muletas no começo da frase, que não mudam o sentido ("ah, como é?"). */
const MULETAS = new Set(["ah", "ue", "uai", "hum", "ahn", "eh", "e", "mas", "entao", "olha", "bom", "desculpa", "desculpe", "perdao", "licenca", "pera"]);

/** "hm", "hmm", "hmmm". */
function ehHm(w: string): boolean {
  return w.length >= 2 && w.startsWith("h") && w.slice(1).split("").every((c) => c === "m");
}

/** Falas que, sozinhas, são só um pedido ("como?", "hã?", "de novo"). */
const SO_MULETA = new Set([
  "como", "como e", "como assim", "como que e", "hein", "ha", "ahn", "ne", "que", "o que", "oi", "perdao", "desculpa",
  "desculpe", "ue", "uai", "ah", "hum", "ok", "certo", "por favor", "pf", "pfv", "de novo",
]);

const VOCE = "voce|ce|vc|tu";
const VERBOS_DE_FALA = ["perguntou", "falou", "disse", "quis dizer"];
const MODAIS = "pode|poderia|consegue|da pra|dava pra";
const A_PERGUNTA = "a pergunta|essa pergunta|sua pergunta|a sua pergunta";

/** "o que você perguntou" com cada forma de "você": usado depois de "não entendi". */
const O_QUE_VOCE_DISSE = alternativas(VOCE)
  .flatMap((v) => VERBOS_DE_FALA.map((f) => `o que ${v[0]} ${f}`))
  .join("|");

const FRASES: Passo[][] = [
  // "o que você perguntou?", "o que que cê disse?"
  [u("o que|qual|que"), o("que"), u(VOCE), o("me"), o("acabou de"), u("perguntou|falou|disse|quis dizer|pediu|quer dizer|falou mesmo")],
  // "qual é a pergunta?"
  [u("qual|que"), u("e|era|foi"), u("a pergunta")],
  [u("como|qual"), u("e|era"), o("que e"), u("a pergunta")],
  // "não entendi", "não ouvi direito", "não entendi a pergunta"
  [o("eu"), u("nao|n"), u("entendi|compreendi|ouvi|escutei|peguei|captei"),
    o(`direito|bem|muito bem|a pergunta|a sua pergunta|essa pergunta|isso|nada|${O_QUE_VOCE_DISSE}`), o("direito|bem|nao")],
  // "pode repetir?", "repete", "repete a pergunta, por favor"
  [o(VOCE), o(MODAIS), u("repetir|repete"), r(`${A_PERGUNTA}|de novo|mais uma vez|outra vez|por favor|pf|pfv`)],
  // "pode explicar de novo?", "explica melhor a pergunta"
  [o(VOCE), o(MODAIS), u("falar|explicar|dizer|perguntar|reformular"), o(A_PERGUNTA),
    u("de novo|mais uma vez|outra vez|melhor|de outro jeito|com outras palavras"), o("por favor|pf|pfv")],
  // "como assim?", "como é que é?": esclarecimento curto
  [u("como"), u("assim|e que e|que e isso|e isso")],
  // "cê disse que tinha um quê?": pedir para o entrevistador repetir o que falou
  [u(VOCE), u("disse|falou"), u("que"), u("tinha|tem|havia|existia"), ate(4)],
  // Corrigir o entrevistador sobre o que está no desenho, em uma negativa CURTA: "não tem nenhuma interrogação na
  // ponta da seta", "não desenhei nenhuma interrogação". Só aceita o que vem logo depois (o lugar da seta); qualquer
  // outra palavra ("porque", "entre a fila e o worker", "do cache pro banco") é explicação do desenho e não casa.
  [o("eu"), u("nao|n"), u("tem|existe|ha|tinha|desenhei|coloquei|fiz"), o("nenhum|nenhuma|nem|uma|um|essa|esse"),
    u("interrogacao|seta|setas"),
    r("na ponta da seta|na ponta|da seta|na seta|ai|ali|aqui|no desenho|no quadro|no diagrama|nenhuma|nenhum|em lugar nenhum")],
  // pedir para encerrar
  [o("eu"), o("quero|vou|posso|podemos|pode|preciso|gostaria de|queria"), u("encerrar|terminar|parar|sair|finalizar"),
    r("a entrevista|essa entrevista|esta entrevista|a sessao|essa sessao|esta sessao|a conversa|essa conversa|esta conversa|por aqui|aqui|agora|isso|por hoje")],
];

/** Quantas palavras, no máximo, uma fala pode ter para ser só um pedido (fala longa sempre tem conteúdo). */
const MAX_PALAVRAS = 30;

function ehTrechoDePedido(trecho: string): boolean {
  let ws = palavrasDe(trecho);
  if (ws.length === 0) return true;
  // tira até 3 muletas do começo, sempre deixando alguma palavra
  for (let i = 0; i < 3; i++) {
    if (ws.length > 3 && ws[0] === "so" && ws[1] === "um" && ws[2] === "segundo") ws = ws.slice(3);
    else if (ws.length > 1 && (MULETAS.has(ws[0]) || ehHm(ws[0]))) ws = ws.slice(1);
    else break;
  }
  if (ws.length === 1 && ehHm(ws[0])) return true;
  if (SO_MULETA.has(ws.join(" "))) return true;
  return FRASES.some((f) => casaInteiro(f, ws));
}

/** Parte a fala nos sinais de pontuação e nos travessões soltos ("a - b"). */
function trechosDe(texto: string): string[] {
  let t = texto;
  for (const sinal of [".", "?", "!", ",", ";", ":", "…", "\n"]) t = t.replaceAll(sinal, "|");
  for (const traco of [" - ", " – ", " — "]) t = t.replaceAll(traco, "|");
  return t.split("|").map((x) => x.trim()).filter((x) => x !== "");
}

/**
 * A fala é só um pedido de repetição ou esclarecimento (ou uma correção curta ao entrevistador, ou um pedido para
 * encerrar)? Vale se TODOS os trechos da fala forem assim: "Como é? O que que cê perguntou?" sim; "Não entendi,
 * mas acho que usaria um cache" não, porque o segundo trecho traz conteúdo; "Não tem seta entre a fila e o worker
 * porque ele puxa sozinho" também não, porque explica o desenho. Pura e sem estado.
 */
export function ehPedidoDeRepeticao(texto: string): boolean {
  const limpo = texto.trim();
  if (!limpo || palavrasDe(limpo).length > MAX_PALAVRAS) return false;
  const trechos = trechosDe(limpo);
  if (trechos.length === 0) return false;
  return trechos.every(ehTrechoDePedido);
}

// ---------------------------------------------------------------------------------------------
// Texto que culpa o candidato
// ---------------------------------------------------------------------------------------------

/** Palavras que mostram que o "esclarecer" é sobre a fala do entrevistador, não sobre o problema. */
function ehPalavraDaConversa(w: string): boolean {
  return w.startsWith("pergunta") || w.startsWith("questionamento") || w.startsWith("entrevistador") || w.startsWith("conversa");
}

/** Depois de "esclarecimento", estas palavras mostram que o pedido foi repetido sem falar de conteúdo ("várias vezes"). */
const SEM_OBJETO = new Set(["varias", "muitas", "diversas", "constantemente", "repetidamente", "sucessivamente", "frequentemente", "sempre", "toda", "novamente"]);

/**
 * "Esclarecer" só é culpa quando o objeto é a pergunta ou a conversa ("pediu esclarecimento da pergunta", "precisou
 * que o entrevistador esclarecesse") ou quando o pedido é descrito só pela repetição ("esclarecimento o tempo todo").
 * Esclarecer o volume, a escala ou os limites do problema é perguntar sobre o problema: ponto positivo, nunca culpa.
 * `gatilho` é a posição de "pediu"/"precisou"/"pedidos" e `j` a de "esclarec...".
 */
function esclarecerEhSobreAFala(ws: string[], gatilho: number, j: number): boolean {
  if (ws.slice(gatilho + 1, j + 5).some(ehPalavraDaConversa)) return true;
  const proxima = ws[j + 1];
  if (proxima === undefined) return false;
  if (SEM_OBJETO.has(proxima)) return true;
  return proxima === "o" && ws[j + 2] === "tempo";
}

const eRepeticao = (w: string) => w.startsWith("repetic") || w.startsWith("repetir") || w.startsWith("repetisse");

/** Cada etapa é uma palavra (testada por `pred`) que deve aparecer em até `max` palavras depois da anterior. */
type Etapa = { pred: (w: string) => boolean; max: number };

function cadeia(ws: string[], de: number, etapas: Etapa[]): boolean {
  if (etapas.length === 0) return true;
  const [e, ...resto] = etapas;
  for (let j = de + 1; j <= de + e.max && j < ws.length; j++) {
    if (e.pred(ws[j]) && cadeia(ws, j, resto)) return true;
  }
  return false;
}

const iniciaCom = (...prefixos: string[]) => (w: string) => prefixos.some((p) => w.startsWith(p));
const ehUma = (...palavras: string[]) => (w: string) => palavras.includes(w);

// Sem palavras de domínio soltas: "pedidos" e "repetição" aparecem em problemas de verdade ("idempotência dos
// pedidos para evitar repetição"), e "desistiu do cache" é uma decisão técnica. Só casa o padrão sobre a conversa.
function pediuRepeticaoOuEsclarecimento(ws: string[]): boolean {
  for (let i = 0; i < ws.length; i++) {
    // "pediu/precisou ... repetir" e "pediu ... esclarecer a pergunta"
    if (["pediu", "pedindo", "pedia", "solicitou", "precisou"].includes(ws[i])) {
      for (let j = i + 1; j <= i + 5 && j < ws.length; j++) {
        if (eRepeticao(ws[j])) return true;
        if (ws[j].startsWith("esclarec") && esclarecerEhSobreAFala(ws, i, j)) return true;
      }
    }
    // "pedido(s)/solicitação de/para repetição/esclarecimento"
    const ehPedidoDe = ws[i] === "pedido" || ws[i] === "pedidos" || ws[i].startsWith("solicitac");
    if (ehPedidoDe && (ws[i + 1] === "de" || ws[i + 1] === "para") && ws[i + 2] !== undefined) {
      if (eRepeticao(ws[i + 2])) return true;
      if (ws[i + 2].startsWith("esclarec") && esclarecerEhSobreAFala(ws, i, i + 2)) return true;
    }
  }
  return false;
}

/**
 * O texto (escrito pelo modelo) culpa o candidato por pedir repetição ou por não acompanhar as perguntas, ou
 * descreve o encerramento com adjetivo? É o que a análise do quadro registrava como "pediu repetições sucessivas"
 * e o relatório repetia. Serve para descartar observações e frases assim. Pedir esclarecimento sobre o PROBLEMA
 * (requisitos, escala, limites, volume, entrada) é bom sinal e nunca conta como culpa.
 */
export function textoCulpaOCandidatoPorPedido(texto: string): boolean {
  const ws = palavrasDe(texto);
  if (pediuRepeticaoOuEsclarecimento(ws)) return true;
  const outros: Passo[][] = [
    // "repetições sucessivas"
    [u("repeticoes"), u("sucessivas|constantes|frequentes|seguidas")],
    // "não entendeu/compreendeu a pergunta", "não conseguiu acompanhar as perguntas"
    [u("nao"), u("entendeu|compreendeu|conseguiu entender|conseguiu acompanhar"), o("a|as|o|os"), u("pergunta*|questionamento*")],
    // "encerrou a entrevista de forma abrupta"
    [u("encerr*|termin*|interromp*"), o("a entrevista|a sessao|a conversa"), o("de forma"), u("abrupt*")],
    // "desistiu da entrevista"
    [u("desistiu"), u("da|de continuar a|de seguir com a"), u("entrevista|sessao|conversa")],
  ];
  if (outros.some((p) => aparece(p, ws))) return true;
  for (let i = 0; i < ws.length; i++) {
    // "dificuldade ... acompanhar/entender ... perguntas/entrevistador"
    if (ws[i] === "dificuldade" && cadeia(ws, i, [
      { pred: ehUma("acompanhar", "entender", "compreender"), max: 6 },
      { pred: iniciaCom("pergunta", "questionamento", "entrevistador", "conversa"), max: 5 },
    ])) return true;
    // "abruptamente ... entrevista/sessão/conversa"
    if (ws[i] === "abruptamente" && cadeia(ws, i, [{ pred: ehUma("entrevista", "sessao", "conversa"), max: 5 }])) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Itens do relatório
// ---------------------------------------------------------------------------------------------

/**
 * "Aprofundar Requisitos e escopo.": só o tema, sem fato. Começa com a palavra "aprofundar", é curto e não tem
 * pontuação de frase no meio (. ; : ,), só o ponto final.
 */
export function ehItemGenerico(texto: string): boolean {
  let t = texto.trim();
  if (t.endsWith(".")) t = t.slice(0, -1);
  if (t.slice(0, 10).toLowerCase() !== "aprofundar") return false;
  if (t.length > 10 && ehLetraOuNumero(t[10])) return false; // "aprofundarem" não é a palavra
  const resto = t.slice(10);
  if (resto.length > 80) return false;
  return !resto.split("").some((c) => c === "." || c === ";" || c === ":" || c === ",");
}

/** O texto manda perguntar na próxima conversa/etapa? */
export function falaDeProximaConversa(texto: string): boolean {
  const n = normalizarParaComparar(texto);
  return n.includes("proxima conversa") || n.includes("proxima etapa");
}

/** O texto já diz quanto a entrevista durou? */
export function mencionaDuracao(texto: string): boolean {
  return palavrasDe(texto).includes("durou");
}

// ---------------------------------------------------------------------------------------------
// Fato de cobertura e termos internos
// ---------------------------------------------------------------------------------------------

/** Antes desta fração do tempo previsto, a sessão conta como encerrada antes da hora. */
export const FRACAO_DE_ENCERRAMENTO_ANTECIPADO = 0.8;

/**
 * O fato de cobertura, sem adjetivo: "A entrevista durou 8 de 15 minutos; 3 de 6 critérios ficaram sem prova."
 * A duração só entra quando a sessão ficou abaixo de 80% do previsto; os minutos chegam crus (podem ser
 * fracionados) e saem inteiros, para baixo. Devolve null quando não há o que dizer.
 */
export function fatoDeCobertura(p: { duracaoMin: number | null; previstoMin: number | null; criteriosSemProva: number; totalCriterios: number }): string | null {
  const partes: string[] = [];
  if (p.duracaoMin !== null && p.previstoMin !== null && p.previstoMin > 0 && p.duracaoMin < FRACAO_DE_ENCERRAMENTO_ANTECIPADO * p.previstoMin) {
    partes.push(`A entrevista durou ${Math.floor(p.duracaoMin)} de ${Math.floor(p.previstoMin)} minutos`);
  }
  if (p.criteriosSemProva > 0) {
    const sem = p.criteriosSemProva === 1
      ? `1 de ${p.totalCriterios} critérios ficou sem prova`
      : `${p.criteriosSemProva} de ${p.totalCriterios} critérios ficaram sem prova`;
    partes.push(partes.length ? sem : sem[0].toUpperCase() + sem.slice(1));
  }
  return partes.length ? `${partes.join("; ")}.` : null;
}

/** "o plin" → "a pergunta", "nos plins" → "nas perguntas": a palavra que vem antes concorda com a troca. */
const PLIN_DEPOIS_DE: Record<string, string> = {
  nos: "nas perguntas",
  aos: "às perguntas",
  dos: "das perguntas",
  os: "as perguntas",
  do: "da pergunta",
  no: "na pergunta",
  ao: "à pergunta",
  o: "a pergunta",
};

/** Parte o texto em palavras e em tudo o que vem entre elas (espaço, pontuação), sem perder nada. */
function segmentos(texto: string): { texto: string; palavra: boolean }[] {
  const saida: { texto: string; palavra: boolean }[] = [];
  for (const ch of texto) {
    const palavra = ehLetraOuNumero(ch);
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.palavra === palavra) ultimo.texto += ch;
    else saida.push({ texto: ch, palavra });
  }
  return saida;
}

/**
 * Troca no texto os termos internos do time pelo que a recrutadora entende. O "plin" é o nome interno da
 * pergunta que o Totti faz; nunca aparece em tela. Só troca a palavra inteira ("plinto" fica como está).
 */
export function semTermosInternos(texto: string): string {
  const saida: { texto: string; palavra: boolean }[] = [];
  for (const seg of segmentos(texto)) {
    const w = seg.texto.toLowerCase();
    if (seg.palavra && (w === "plin" || w === "plins")) {
      const plural = w === "plins";
      const espaco = saida[saida.length - 1];
      const anterior = saida[saida.length - 2];
      const antes = anterior && espaco && espaco.texto === " " && !espaco.palavra && anterior.palavra ? anterior.texto.toLowerCase() : "";
      const troca = PLIN_DEPOIS_DE[antes];
      // a palavra anterior só entra na troca se o número bate: "os plins" sim, "o plins" não
      if (troca !== undefined && troca.endsWith("s") === plural) {
        saida.splice(saida.length - 2, 2, { texto: troca, palavra: true });
      } else {
        saida.push({ texto: plural ? "perguntas" : "pergunta", palavra: true });
      }
    } else {
      saida.push(seg);
    }
  }
  return saida.map((s) => s.texto).join("");
}
