/**
 * Candidatos de teste (time), vindos de `CANDIDATOS_TESTE`. Só eles recebem email de verdade:
 * os demais são dados de demonstração com endereços falsos.
 */
import { z } from "zod";

const EMAIL = z.string().email().max(254);

/** Formato: "Nome Sobrenome <email>; Outro Nome <email2>". Entradas inválidas são ignoradas. */
export function candidatosTeste(): { nome: string; email: string }[] {
  const bruto = process.env.CANDIDATOS_TESTE ?? "";
  const candidatos: { nome: string; email: string }[] = [];
  for (const entrada of bruto.split(";")) {
    const texto = entrada.trim();
    if (!texto) continue;
    const casado = texto.match(/^(.*?)\s*<\s*([^<>]+?)\s*>$/);
    const nomeBruto = casado ? casado[1].trim() : "";
    const email = (casado ? casado[2] : texto).trim().toLowerCase();
    const valido = EMAIL.safeParse(email);
    if (!valido.success) continue;
    candidatos.push({ nome: nomeBruto || email.split("@")[0], email: valido.data });
  }
  return candidatos;
}

export function ehCandidatoTeste(email: string): boolean {
  const alvo = email.trim().toLowerCase();
  return candidatosTeste().some((c) => c.email === alvo);
}
