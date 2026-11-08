// Voz do navegador, usada só no modo de demonstração do quadro (sem servidor, não há ElevenLabs). A voz do agente é
// masculina (Fernando - Casual), então a demonstração também prefere uma voz masculina em pt-BR. Com servidor, o
// agente fala sempre com a voz do ElevenLabs.

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
