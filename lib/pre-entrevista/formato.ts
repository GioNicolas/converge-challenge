/**
 * Pedido de formato lido direto da fala, sem LLM: "vamos de quadro", "quero no Excalidraw", "código ao vivo".
 * O classificador (Jev) só reconhecia "system design" e "live coding" ao pé da letra; "quadro" e "Excalidraw",
 * que são os nomes que a própria tela usa, passavam batido e o plano ficava no formato errado mesmo depois de
 * ela confirmar. Pergunta ("o que é o quadro?"), negação perto do termo ou pedido dos dois formatos não contam.
 */
import type { InterviewMode } from "@/lib/contracts";

const SYSTEM_DESIGN =
  /\b(?:excalidraw|quadro(?: branco)?|system ?design|desenh(?:ar|o|e|ando) (?:a |uma |o |um )?(?:arquitetura|sistema|solu[cç][aã]o|diagrama)|arquitetura de sistemas?|diagrama)\b/i;
const LIVE_CODING =
  /\b(?:live ?cod(?:e|ing)|c[oó]digo ao vivo|cod(?:ar|ando|e) ao vivo|codar|codando|programa(?:r|ndo) ao vivo|na ide|uma ide|editor de c[oó]digo|escrev(?:er|a|endo) c[oó]digo|program(?:ar|e|ando)|constru(?:ir|indo) (?:um |o )?(?:c[oó]digo|algoritmo)|resolv(?:er|endo) (?:um |o )?algoritmo|algoritmo ao vivo)\b/i;
/** Negação logo antes do termo: "não quero quadro", "nada de código ao vivo", "esquece o Excalidraw". */
const NEGACAO = /\b(?:n[aã]o|nada de|sem|esquece|esquecer|tira|tirar|nem)\b[^.!?]{0,25}$/i;

function pede(texto: string, termo: RegExp): boolean {
  const m = texto.match(termo);
  if (!m || m.index === undefined) return false;
  return !NEGACAO.test(texto.slice(0, m.index));
}

export function lerFormato(texto: string): InterviewMode | undefined {
  const t = texto.trim();
  if (!t || t.includes("?")) return undefined;
  const sd = pede(t, SYSTEM_DESIGN);
  const lc = pede(t, LIVE_CODING);
  if (sd === lc) return undefined;
  return sd ? "system_design" : "live_coding";
}
