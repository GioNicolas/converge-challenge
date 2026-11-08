// Voz reserva do navegador (quando o áudio do ElevenLabs não toca). A voz do agente é masculina (Fernando - Casual),
// então a reserva também prefere uma voz masculina em pt-BR. Pegar a primeira voz "pt" da lista dava a Luciana
// no Mac (feminina) e a fala trocava de pessoa no meio da entrevista.

type VozNavegador = Pick<SpeechSynthesisVoice, "name" | "lang">;

// Vozes masculinas pt-BR conhecidas, em ordem de preferência (Edge/Windows, macOS antigo, Windows, macOS atual).
const MASCULINAS = [
  "Antonio", "Felipe", "Daniel", "Donato", "Fabio", "Julio", "Humberto", "Nicolau", "Valerio",
  "Reed", "Eddy", "Rocko", "Grandpa",
];
// Vozes femininas conhecidas: nunca escolhidas se houver outra pt-BR. As do Google vão pelo nome completo,
// para não descartar outras vozes do mesmo fornecedor.
const FEMININAS = [
  "Luciana", "Joana", "Catarina", "Francisca", "Maria", "Raquel", "Fernanda", "Leticia", "Thalita", "Brenda",
  "Elza", "Giovanna", "Leila", "Manuela", "Yara", "Flo", "Sandy", "Shelley", "Grandma", "Google português do Brasil",
];

const palavraInteira = (nome: string) => new RegExp(`(^|[^\\p{L}])${nome}([^\\p{L}]|$)`, "iu");
const REGEX_MASCULINAS = MASCULINAS.map(palavraInteira);
const REGEX_FEMININA = palavraInteira(`(${FEMININAS.join("|")})`);

const ehPt = (v: VozNavegador) => /^pt(-|_|$)/i.test(v.lang);
const ehPtBr = (v: VozNavegador) => /^pt[-_]br$/i.test(v.lang);

export function escolherVozPt<V extends VozNavegador>(vozes: readonly V[]): V | undefined {
  const ptBr = vozes.filter(ehPtBr);
  for (const regex of REGEX_MASCULINAS) {
    const voz = ptBr.find((v) => regex.test(v.name));
    if (voz) return voz;
  }
  return ptBr.find((v) => !REGEX_FEMININA.test(v.name)) ?? ptBr[0] ?? vozes.find(ehPt);
}

let vozesAquecidas = false;

/**
 * Chrome e Safari devolvem a lista de vozes vazia na primeira chamada de getVoices() e só a preenchem depois do
 * evento voiceschanged. Sem a lista, a fala sai na voz padrão de pt-BR (feminina). Chamado ao abrir as telas que
 * falam, para a lista já estar pronta quando a primeira fala de reserva acontecer.
 */
export function aquecerVozes(): void {
  if (vozesAquecidas || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  vozesAquecidas = true;
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", () => window.speechSynthesis.getVoices(), { once: true });
  } catch {}
}
