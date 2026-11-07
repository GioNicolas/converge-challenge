export type Componente = Readonly<{
  id: string;
  tipo: "rectangle" | "ellipse" | "diamond" | "iframe" | "embeddable";
  nome: string;
  dentroDe: string | null;
}>;

export type Conexao = Readonly<{
  id: string;
  tipo: "arrow" | "line";
  de: string | null;
  para: string | null;
  rotulo: string;
}>;

export type Secao = Readonly<{
  id: string;
  tipo: "frame" | "magicframe" | "grupo";
  nome: string;
  membros: readonly string[];
}>;

/** Apenas dados semânticos; coordenadas e apresentação ficam fora do diff. */
export type Instantaneo = Readonly<{
  componentes: readonly Componente[];
  conexoes: readonly Conexao[];
  anotacoes: readonly Readonly<{ id: string; texto: string }>[];
  secoes: readonly Secao[];
  desenhos: readonly Readonly<{ id: string; tipo: "freedraw" | "image" }>[];
}>;

export const tiposEmPortugues = {
  rectangle: "retângulo",
  ellipse: "elipse",
  diamond: "losango",
  iframe: "quadro incorporado",
  embeddable: "conteúdo incorporado",
} as const;

export function normalizarTexto(texto: string): string {
  return texto.replace(/\s+/gu, " ").trim();
}

export function textoCurto(texto: string): string {
  const caracteres = Array.from(texto);
  return caracteres.length > 80 ? caracteres.slice(0, 79).join("") + "…" : texto;
}

export function entreAspas(texto: string): string {
  return JSON.stringify(textoCurto(texto));
}

export function nomeDoElemento(instantaneo: Instantaneo, id: string | null): string {
  if (id === null) return "?";
  const componente = instantaneo.componentes.find((item) => item.id === id);
  if (componente?.nome) return textoCurto(componente.nome);
  const nota = instantaneo.anotacoes.find((item) => item.id === id);
  if (nota?.texto) return textoCurto(nota.texto);
  const secao = instantaneo.secoes.find((item) => item.id === id);
  return secao?.nome ? textoCurto(secao.nome) : `[${id}]`;
}

export function descreverConexao(instantaneo: Instantaneo, conexao: Conexao): string {
  return `${nomeDoElemento(instantaneo, conexao.de)} ${conexao.tipo === "line" ? "—" : "→"} ${nomeDoElemento(instantaneo, conexao.para)}`;
}
