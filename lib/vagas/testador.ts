// Quem está testando o site: nome e e-mail deixados ao publicar a primeira vaga (EnvioConvites).
// Fica no navegador e, a partir daí, a pessoa aparece como inscrita em toda vaga, sem digitar de novo.
// O servidor manda e-mail de verdade para esse endereço (com limite: lib/convites/testador.ts).
import { z } from "zod";

export type Testador = { nome: string; email: string };

const CHAVE = "converge.testador.v1";
/** Evento disparado ao salvar, para as listas de candidatos se remontarem. */
export const EVENTO_TESTADOR = CHAVE;

const Schema = z.object({ nome: z.string().trim().min(1).max(120), email: z.string().trim().toLowerCase().email().max(254) });

export function lerTestador(): Testador | null {
  try {
    const parsed = Schema.safeParse(JSON.parse(localStorage.getItem(CHAVE) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Valida e salva. Devolve o testador normalizado, ou a mensagem do que está errado. */
export function salvarTestador(nome: string, email: string): { ok: true; testador: Testador } | { ok: false; erro: string } {
  const parsed = Schema.safeParse({ nome: nome.trim() || email.split("@")[0], email });
  if (!parsed.success) return { ok: false, erro: "Confira o e-mail." };
  try {
    localStorage.setItem(CHAVE, JSON.stringify(parsed.data));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  window.dispatchEvent(new Event(CHAVE));
  return { ok: true, testador: parsed.data };
}
