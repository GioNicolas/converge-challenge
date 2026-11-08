// Guardas estruturais aplicadas à saída do LLM (formato e repetição). NÃO há listas de palavras aqui:
// o que o candidato quis dizer, e o que o agente pode ou não dizer, é decidido no prompt.

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem e ou que se como qual quais seu sua seus suas ele ela isso esse essa este esta voce vai ser sao foi tem ter mais mas ao aos pela pelo la aqui ja so".split(
    " ",
  ),
);

function tokens(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(" ")
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * Sobreposição de tokens (coeficiente de Szymkiewicz-Simpson: interseção / menor conjunto).
 * Exige pelo menos 3 tokens de conteúdo nos dois lados, para frases curtas não colidirem à toa.
 */
export function sobreposicao(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  const menor = Math.min(ta.size, tb.size);
  if (menor < 3) return normalizar(a) === normalizar(b) && ta.size > 0 ? 1 : 0;
  let comum = 0;
  for (const t of ta) if (tb.has(t)) comum++;
  return comum / menor;
}

export const LIMIAR_DUPLICADA = 0.7;

export function eQuaseDuplicada(pergunta: string, anteriores: string[]): boolean {
  return anteriores.some((p) => sobreposicao(pergunta, p) >= LIMIAR_DUPLICADA);
}

/** Abreviações comuns que terminam em ponto sem terminar a frase. */
const ABREVIACAO_NO_FIM = /(?:^|[\s(])(?:ex|p\.ex|aprox|sr|sra|dr|dra|vs|obs|pág|pag|n[º°o])\.$/i;

/**
 * Divide em frases. Só pontuação seguida de espaço (ou do fim) termina frase: "2.5", "99.9%" e "R$ 1.000" não
 * cortam, nem abreviações como "ex." e "aprox.".
 */
export function frasesDe(texto: string): string[] {
  const t = texto.trim();
  const frases: string[] = [];
  const fimDeFrase = /[.!?]+(?=\s|$)/g;
  let inicio = 0;
  for (let m = fimDeFrase.exec(t); m; m = fimDeFrase.exec(t)) {
    const fim = m.index + m[0].length;
    const trecho = t.slice(inicio, fim);
    if (m[0] === "." && ABREVIACAO_NO_FIM.test(trecho)) continue;
    frases.push(trecho.trim());
    inicio = fim;
  }
  const resto = t.slice(inicio).trim();
  if (resto) frases.push(resto);
  return frases;
}

/** Corta em no máximo `n` frases (para a fala curta do loop rápido). */
export function limitarFrases(texto: string, n: number): string {
  return frasesDe(texto).slice(0, n).join(" ").trim();
}

/**
 * Troca ids do grafo ("[r5]", "o r5") pelo nome do elemento ("Cache Redis") numa fala. O modelo às vezes fala
 * o id, que não significa nada para quem ouve. Sem nome conhecido, o id sai e fica "esse elemento".
 */
export function trocarIdsPorNomes(texto: string, grafo: string): string {
  const nomes = new Map<string, string>();
  for (const linha of grafo.split("\n")) {
    const m = linha.match(/^\s*-\s*\[([a-z]\d+)\]\s+(.+?)(?:\s+\((?:retângulo|elipse|losango|texto|moldura|imagem|desenho)[^)]*\))?\s*(?:—.*)?$/i);
    if (m && !/[→—]/.test(m[2])) nomes.set(m[1].toLowerCase(), m[2].replace(/^"|"$/g, "").trim());
  }
  return texto
    .replace(/\[([a-z]\d+)\]/gi, (_, id: string) => nomes.get(id.toLowerCase()) ?? "esse elemento")
    .replace(/\b([a-z]\d+)\b/g, (todo, id: string) => nomes.get(id) ?? todo)
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Os três primeiros são os de sempre; os outros existem para o convite não se repetir de uma fala para a outra
 * (o mesmo "Continua daí." várias vezes seguidas soa como gravação).
 */
const CONVITES = [
  "Pode continuar de onde parou.",
  "Continua daí.",
  "Pode seguir com o desenho.",
  "Fica à vontade para seguir.",
  "Pode retomar de onde estava.",
  "Segue no seu ritmo.",
];

/**
 * O convite que o agente ainda não usou nas falas recentes. Sem histórico, ou com todos já usados, vale a escolha
 * de sempre (pelo tamanho do texto); com histórico, anda a partir dela até achar um que não foi dito.
 */
export function escolherConvite(texto: string, jaDitas: string[] = []): string {
  const ditas = jaDitas.map(normalizar);
  const inicio = texto.length % 3;
  for (let i = 0; i < CONVITES.length; i++) {
    const convite = CONVITES[(inicio + i) % CONVITES.length];
    const marca = normalizar(convite);
    if (!ditas.some((d) => d.includes(marca))) return convite;
  }
  return CONVITES[inicio];
}

/** A frase devolve a vez: um próximo passo dirigido ao candidato (o mesmo critério do scripts/validar-conversa.ts). */
export const PROXIMO_PASSO = /^(pode|podemos|vamos|me (conta|conte|mostra|mostre|explica|explique|diz|diga|fala|fale)|mostra|mostre|explica|explique|conta|conte|segue|siga|continua|continue|desenha|desenhe|marca|marque|aponta|aponte|começa|comece|escolhe|escolha|traz|traga|fica à vontade|fique à vontade|quando quiser|é só)/i;

/** A fala já termina devolvendo a vez: numa pergunta ou num próximo passo (também depois de uma vírgula). */
export function devolveAVez(texto: string): boolean {
  const ultima = (frasesDe(texto.trim()).at(-1) ?? "").trim();
  const oracoes = [ultima, ultima.split(/,\s+/).at(-1) ?? ""];
  return ultima.endsWith("?") || oracoes.some((o) => PROXIMO_PASSO.test(o.replace(/^(e|então|agora|com isso|beleza|certo),?\s+/i, "")));
}

/**
 * Toda fala termina com a bola com ele. O modelo às vezes para no fato ("Isso, um bilhão por mês.") e o candidato
 * fica sem saber se é a vez dele: aí entra um convite curto no fim.
 */
export function comVezDevolvida(texto: string, jaDitas: string[] = []): string {
  const t = texto.trim();
  if (!t || devolveAVez(t)) return t;
  return `${t} ${escolherConvite(t, jaDitas)}`;
}

/**
 * Depois de um "não sei" ou de um "pula", a fala não termina em pergunta: o modelo às vezes fecha com uma
 * pergunta de condução ("quer olhar outra parte?") e o candidato, que acabou de soltar o assunto, fica com outra
 * cobrança. Tira a frase com interrogação do fim e, se não sobrar convite, põe um curto.
 */
export function semPerguntaNoFim(texto: string, jaDitas: string[] = []): string {
  const t = texto.trim();
  if (!t.endsWith("?")) return t;
  const frases = frasesDe(t);
  while (frases.length && frases[frases.length - 1].endsWith("?")) frases.pop();
  const convite = escolherConvite(t, jaDitas);
  return [...frases, convite].join(" ");
}

/**
 * Como `semPerguntaNoFim`, mas sem colar um convite pronto quando ainda sobra fala: "Tranquilo, seguimos." já
 * devolve a vez. O convite fixo só entra se a fala era só a pergunta.
 */
/** Começos que só devolvem ao candidato o que ele acabou de dizer ("Entendi que…", "Então você…", "Ou seja…"). */
const ABERTURA_DE_ECO =
  /^(?:eu entendi\b|entendi (?:que|entao|voce|vc)\b|se (?:eu )?entendi\b|pelo que (?:eu )?entendi\b|pelo que voce (?:disse|falou)\b|(?:ok |certo |ta |beleza )?entao voce\b|voce (?:disse|falou|comentou|mencionou|explicou|colocou|quer|vai|pretende|esta|ta|escolheu|decidiu)\b|ou seja\b|resumindo\b)/;
/** Parte das palavras de conteúdo da frase que já estavam na fala do candidato para contar como eco. */
const LIMIAR_ECO = 0.7;

/**
 * Tira a primeira frase quando ela só repete o que o candidato acabou de dizer ("Contador com base 62.",
 * "Entendi que você vai usar Postgres.") e ainda sobra fala depois. Ele sabe o que disse: o eco soa robô e
 * gasta o tempo dele. Resposta a uma pergunta dele fica de fora pelas palavras (confirmar usa as mesmas).
 */
export function semEcoNoComeco(texto: string, falaDoCandidato: string): string {
  const frases = frasesDe(texto);
  if (frases.length < 2 || frases[0].endsWith("?")) return texto.trim();
  const primeira = normalizar(frases[0]);
  let eco = ABERTURA_DE_ECO.test(primeira);
  if (!eco && !falaDoCandidato.trim().endsWith("?")) {
    const daFrase = tokens(frases[0]);
    const daFala = tokens(falaDoCandidato);
    let comum = 0;
    for (const t of daFrase) if (daFala.has(t)) comum++;
    eco = daFrase.size >= 1 && comum / daFrase.size >= LIMIAR_ECO;
  }
  return eco ? frases.slice(1).join(" ").trim() : texto.trim();
}

/** Fala que é só uma reação, sem conteúdo ("Hm.", "Tá.", "Certo, beleza."). */
const SO_REACAO = /^(?:(?:h+m+|hum+|uhum|aham|ta|certo|ok|okay|beleza|entendi|saquei|anotado|sei|show|legal|blz)\s*)+$/;

export function eSoReacao(texto: string | undefined): boolean {
  const t = normalizar(texto ?? "");
  return t.length > 0 && SO_REACAO.test(t);
}

export function semPerguntaNoFimV2(texto: string): string {
  const t = texto.trim();
  if (!t.endsWith("?")) return t;
  const frases = frasesDe(t);
  while (frases.length && frases[frases.length - 1].endsWith("?")) frases.pop();
  return frases.length ? frases.join(" ") : CONVITES[t.length % CONVITES.length];
}
