/** Medição da transcrição sem depender de ouvido: taxa de erro por palavra (WER) contra o texto de referência. */

/** Minúsculas, sem acento nem pontuação: "Cê falou o quê?" e "ce falou o que" contam como iguais. */
export function palavrasNormalizadas(texto: string): string[] {
  return texto
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean);
}

/** Distância de edição por palavra (substituição, inserção e remoção) dividida pelo número de palavras da referência. */
export function taxaDeErroPorPalavra(referencia: string, hipotese: string): number {
  const ref = palavrasNormalizadas(referencia);
  const hip = palavrasNormalizadas(hipotese);
  if (!ref.length) return hip.length ? 1 : 0;
  let anterior = Array.from({ length: hip.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i++) {
    const atual = [i];
    for (let j = 1; j <= hip.length; j++) {
      const troca = anterior[j - 1] + (ref[i - 1] === hip[j - 1] ? 0 : 1);
      atual.push(Math.min(troca, anterior[j] + 1, atual[j - 1] + 1));
    }
    anterior = atual;
  }
  return anterior[hip.length] / ref.length;
}

/** Quais termos esperados (normalizados) aparecem na transcrição. */
export function termosAcertados(termos: readonly string[], hipotese: string): { termo: string; acertou: boolean }[] {
  const texto = ` ${palavrasNormalizadas(hipotese).join(" ")} `;
  return termos.map((termo) => ({ termo, acertou: texto.includes(` ${palavrasNormalizadas(termo).join(" ")} `) }));
}
