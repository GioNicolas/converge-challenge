// Leitura de documentos da vaga (PDF, TXT, Markdown) no próprio navegador: o arquivo não sai da máquina,
// só o texto extraído vai para a conversa com o Totti.

export type Documento = {
  id: string;
  nome: string;
  tipo: "pdf" | "texto";
  tamanho: number;
  paginas?: number;
  texto: string;
};

export const ACEITOS = ".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown";
const LIMITE_BYTES = 10 * 1024 * 1024;
/** Texto demais atrapalha a conversa: corta com aviso. */
export const LIMITE_CARACTERES = 20_000;

function tipoDe(arquivo: File): Documento["tipo"] | null {
  const nome = arquivo.name.toLowerCase();
  if (arquivo.type === "application/pdf" || nome.endsWith(".pdf")) return "pdf";
  if (arquivo.type.startsWith("text/") || /\.(txt|md|markdown)$/.test(nome)) return "texto";
  return null;
}

async function textoDoPdf(arquivo: File): Promise<{ texto: string; paginas: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const partes: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const conteudo = await pagina.getTextContent();
    // Junta os pedaços da página respeitando as quebras de linha que o PDF indica.
    let linha = "";
    for (const item of conteudo.items) {
      if (!("str" in item)) continue;
      linha += item.str;
      if (item.hasEOL) {
        partes.push(linha);
        linha = "";
      }
    }
    if (linha) partes.push(linha);
    partes.push("");
  }
  return { texto: partes.join("\n"), paginas: pdf.numPages };
}

/** Normaliza espaços e linhas em branco repetidas. */
function limpar(texto: string) {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function lerDocumento(arquivo: File): Promise<Documento> {
  const tipo = tipoDe(arquivo);
  if (!tipo) throw new Error(`${arquivo.name}: formato não suportado (use PDF, TXT ou Markdown).`);
  if (arquivo.size > LIMITE_BYTES) throw new Error(`${arquivo.name}: o arquivo passa de 10 MB.`);
  let texto: string;
  let paginas: number | undefined;
  if (tipo === "pdf") {
    try {
      ({ texto, paginas } = await textoDoPdf(arquivo));
    } catch {
      throw new Error(`${arquivo.name}: não consegui ler o PDF.`);
    }
  } else {
    texto = await arquivo.text();
  }
  texto = limpar(texto);
  if (!texto) {
    throw new Error(
      tipo === "pdf"
        ? `${arquivo.name}: o PDF não tem texto selecionável (parece ser uma imagem escaneada).`
        : `${arquivo.name}: o arquivo está vazio.`,
    );
  }
  return {
    id: `${arquivo.name}-${arquivo.size}-${arquivo.lastModified}`,
    nome: arquivo.name,
    tipo,
    tamanho: arquivo.size,
    paginas,
    texto: texto.length > LIMITE_CARACTERES ? `${texto.slice(0, LIMITE_CARACTERES)}\n[…documento cortado]` : texto,
  };
}

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
