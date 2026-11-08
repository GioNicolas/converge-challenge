// Voz reserva do navegador (quando o áudio do ElevenLabs não toca). A voz do agente é masculina (Fernando - Casual),
// então a reserva também prefere uma voz masculina em pt-BR. Pegar a primeira voz "pt" da lista dava a Luciana
// no Mac (feminina) e a fala trocava de pessoa no meio da entrevista.

type VozNavegador = Pick<SpeechSynthesisVoice, "name" | "lang">;

// Vozes masculinas pt-BR conhecidas, em ordem de preferência (Edge/Windows, macOS antigo, Windows, macOS atual).
const MASCULINAS = [
  "Antonio", "Felipe", "Daniel", "Donato", "Fabio", "Julio", "Humberto", "Nicolau", "Valerio",
  "Reed", "Eddy", "Rocko", "Grandpa",
];
// Vozes femininas conhecidas: nunca escolhidas se houver outra pt-BR.
const FEMININAS = [
  "Luciana", "Joana", "Catarina", "Francisca", "Maria", "Raquel", "Fernanda", "Leticia", "Thalita", "Brenda",
  "Elza", "Giovanna", "Leila", "Manuela", "Yara", "Flo", "Sandy", "Shelley", "Grandma", "Google",
];

const ehPt = (v: VozNavegador) => /^pt(-|_|$)/i.test(v.lang);
const ehPtBr = (v: VozNavegador) => /^pt[-_]br$/i.test(v.lang);
const temNome = (v: VozNavegador, nomes: string[]) =>
  nomes.some((n) => new RegExp(`(^|[^\\p{L}])${n}([^\\p{L}]|$)`, "iu").test(v.name));

export function escolherVozPt<V extends VozNavegador>(vozes: readonly V[]): V | undefined {
  const ptBr = vozes.filter(ehPtBr);
  for (const nome of MASCULINAS) {
    const voz = ptBr.find((v) => temNome(v, [nome]));
    if (voz) return voz;
  }
  return ptBr.find((v) => !temNome(v, FEMININAS)) ?? ptBr[0] ?? vozes.find(ehPt);
}
