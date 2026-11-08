/**
 * Candidatos de teste (o time): aparecem como inscritos em toda vaga. Vêm de `CANDIDATOS_TESTE` e, sem
 * a variável, do `TIME` abaixo. Os demais candidatos são dados de demonstração com endereços falsos.
 *
 * E-mail de verdade só sai para quem está em `RECEBEM_EMAIL` (hoje, só o Lucas): os outros do time
 * entram no fluxo como simulados, para não gastar envio à toa.
 */
import { z } from "zod";

const EMAIL = z.string().email().max(254);

const TIME = [
  { nome: "Lucas Todaro", email: "ltodarosouza@gmail.com" },
  { nome: "Sofia Marques", email: "sofiaomarques26@gmail.com" },
  { nome: "Henrique Guimarães", email: "henrique.guimaa08@gmail.com" },
  // Sem e-mail pessoal no histórico do git: o endereço do GitHub só aparece na lista, nunca recebe envio.
  { nome: "Giorgio Nícolas", email: "163905946+gionicolas@users.noreply.github.com" },
];

const RECEBEM_EMAIL = new Set(["ltodarosouza@gmail.com"]);

/** Formato: "Nome Sobrenome <email>; Outro Nome <email2>". Entradas inválidas são ignoradas. Vazio: o `TIME`. */
export function candidatosTeste(): { nome: string; email: string }[] {
  const bruto = process.env.CANDIDATOS_TESTE ?? "";
  if (!bruto.trim()) return TIME;
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

/** Candidato de teste que recebe e-mail de verdade (os demais do time ficam simulados). */
export function recebeEmail(email: string): boolean {
  return ehCandidatoTeste(email) && RECEBEM_EMAIL.has(email.trim().toLowerCase());
}
