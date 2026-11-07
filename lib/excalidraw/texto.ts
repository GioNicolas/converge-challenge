/** Quebra o texto em linhas de até `largura` caracteres, sem cortar palavras. */
export function quebrarLinhas(texto: string, largura: number) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    if (atual && (atual + " " + palavra).length > largura) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.join("\n");
}
