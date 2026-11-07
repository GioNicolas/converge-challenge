export type Alinhamento = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

type Palavra = { texto: string; inicio: number; fim: number; indiceInicial: number };
type BlocoLegenda = { texto: string; inicio: number; fim: number };

/** Agrupa por espaços, preservando acentos, pontuação e o índice no alinhamento original. */
export function palavras(a: Alinhamento): Palavra[] {
  const resultado: Palavra[] = [];
  let atual: Palavra | null = null;
  for (let i = 0; i < a.characters.length; i++) {
    const caractere = a.characters[i];
    if (!caractere) continue;
    if (/^\s+$/u.test(caractere)) {
      if (atual) resultado.push(atual);
      atual = null;
    } else if (atual) {
      atual.texto += caractere;
      atual.fim = a.character_end_times_seconds[i];
    } else {
      atual = { texto: caractere, inicio: a.character_start_times_seconds[i], fim: a.character_end_times_seconds[i], indiceInicial: i };
    }
  }
  if (atual) resultado.push(atual);
  return resultado;
}

/** Revela o caractere quando seu intervalo começa; mantém os espaços e a pontuação originais. */
export function textoFaladoAte(a: Alinhamento, tempo: number): string {
  let quantidade = 0;
  while (quantidade < a.characters.length && a.character_start_times_seconds[quantidade] <= tempo) quantidade++;
  return a.characters.slice(0, quantidade).join("");
}

/** Intervalos semiabertos: início inclusivo, fim exclusivo. */
export function palavraEm(a: Alinhamento, tempo: number): number {
  return palavras(a).findIndex((p) => p.inicio <= tempo && tempo < p.fim);
}

function normalizarComIndices(caracteres: readonly string[]): { texto: string; indices: number[] } {
  let texto = "";
  const indices: number[] = [];
  for (let i = 0; i < caracteres.length; i++) {
    const normalizado = caracteres[i].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (const caractere of normalizado) {
      if (/[\p{L}\p{N}]/u.test(caractere)) {
        texto += caractere;
        // indexOf usa unidades UTF-16; todas apontam para o mesmo item original.
        for (let j = 0; j < caractere.length; j++) indices.push(i);
      } else if (/\s/u.test(caractere) && texto && !texto.endsWith(" ")) {
        texto += " ";
        indices.push(i);
      }
    }
  }
  if (texto.endsWith(" ")) {
    texto = texto.slice(0, -1);
    indices.pop();
  }
  return { texto, indices };
}

/** Primeira ocorrência, ignorando caixa, acentos e pontuação e normalizando espaços. */
export function momentoDoTrecho(a: Alinhamento, trecho: string): number | null {
  const busca = normalizarComIndices(Array.from(trecho)).texto;
  if (!busca) return null;
  const normalizado = normalizarComIndices(a.characters);
  const indice = normalizado.texto.indexOf(busca);
  return indice < 0 ? null : a.character_start_times_seconds[normalizado.indices[indice]];
}

/**
 * Blocos com palavras inteiras e espaços simples entre elas.
 * Rejeita limite inválido ou menor que uma palavra, para nunca cortá-la nem excedê-lo.
 */
export function blocosDeLegenda(a: Alinhamento, maxCaracteres = 84): BlocoLegenda[] {
  if (!Number.isSafeInteger(maxCaracteres) || maxCaracteres <= 0) {
    throw new RangeError("O limite de caracteres deve ser um inteiro positivo.");
  }
  const resultado: BlocoLegenda[] = [];
  let atual: BlocoLegenda | null = null;
  for (const palavra of palavras(a)) {
    if (palavra.texto.length > maxCaracteres) {
      throw new RangeError("O limite de caracteres é menor que uma palavra inteira.");
    }
    if (atual && atual.texto.length + 1 + palavra.texto.length <= maxCaracteres) {
      atual.texto += ` ${palavra.texto}`;
      atual.fim = palavra.fim;
    } else {
      if (atual) resultado.push(atual);
      atual = { texto: palavra.texto, inicio: palavra.inicio, fim: palavra.fim };
    }
  }
  if (atual) resultado.push(atual);
  return resultado;
}
