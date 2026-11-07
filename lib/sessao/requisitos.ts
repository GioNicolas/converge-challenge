// Lista dos requisitos já combinados na conversa (ex.: "Guardar por 5 anos").
// Lógica pura: sem React, para testar e reaproveitar quando os requisitos vierem do servidor.

export type Requisito = { id: string; texto: string };

/** Forma de comparar textos: sem maiúsculas, sem acentos e com os espaços normalizados. */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Id estável: sai do próprio texto normalizado, então o mesmo requisito tem sempre o mesmo id. */
function idDe(chave: string) {
  let h = 5381;
  for (let i = 0; i < chave.length; i++) h = ((h << 5) + h + chave.charCodeAt(i)) >>> 0;
  return `req-${h.toString(36)}`;
}

/**
 * Acrescenta um requisito no fim da lista.
 * Ignora texto vazio e repetido (devolve a mesma lista, sem copiar).
 */
export function adicionar(lista: readonly Requisito[], texto: string): Requisito[] {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const chave = normalizar(limpo);
  if (!chave) return lista as Requisito[];
  if (lista.some((r) => normalizar(r.texto) === chave)) return lista as Requisito[];
  return [...lista, { id: idDe(chave), texto: limpo }];
}

/** Acrescenta vários de uma vez, na ordem em que chegaram. */
export function adicionarVarios(lista: readonly Requisito[], textos: readonly string[]): Requisito[] {
  return textos.reduce<Requisito[]>((acc, t) => adicionar(acc, t), lista as Requisito[]);
}
