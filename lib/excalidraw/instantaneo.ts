export type Componente = Readonly<{
  id: string;
  tipo: "rectangle" | "ellipse" | "diamond" | "iframe" | "embeddable";
  nome: string;
  dentroDe: string | null;
}>;

/**
 * Sentido da conexão, pelas pontas desenhadas:
 * "→" de `de` para `para` (uma ponta só; se ela estava no começo, `de` e `para` já vêm trocados),
 * "↔" ponta nos dois lados, "—" nenhuma ponta (linha ou seta sem cabeça).
 */
export type Seta = "→" | "↔" | "—";

export type Conexao = Readonly<{
  id: string;
  tipo: "arrow" | "line";
  de: string | null;
  para: string | null;
  seta: Seta;
  rotulo: string;
  /** Seta ou linha desenhada tracejada ou pontilhada. */
  tracejada?: boolean;
  /**
   * Alguma ponta não encostava na caixa nem tinha vínculo: foi ligada pela direção da seta
   * (o prolongamento do último trecho cruza a caixa). É uma ligação provável, não certa.
   */
  inferida?: true;
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
  anotacoes: readonly Readonly<{ id: string; texto: string; dentroDe?: string | null }>[];
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
  // Só chega aqui sem id em contextos sem direção; nas conexões, `descreverConexao` diz sem origem/sem destino.
  if (id === null) return "(sem elemento)";
  const componente = instantaneo.componentes.find((item) => item.id === id);
  if (componente?.nome) return textoCurto(componente.nome);
  const nota = instantaneo.anotacoes.find((item) => item.id === id);
  if (nota?.texto) return textoCurto(nota.texto);
  const secao = instantaneo.secoes.find((item) => item.id === id);
  return secao?.nome ? textoCurto(secao.nome) : `[${id}]`;
}

export function descreverConexao(instantaneo: Instantaneo, conexao: Conexao): string {
  const de = conexao.de === null ? "(sem origem)" : nomeDoElemento(instantaneo, conexao.de);
  const para = conexao.para === null ? "(sem destino)" : nomeDoElemento(instantaneo, conexao.para);
  return `${de} ${conexao.seta} ${para}`;
}

/** Marca de uma conexão ligada pela direção da seta, usada no grafo e no diff. */
export const MARCA_PONTA_PERTO = "(ponta perto, sem encostar)";
