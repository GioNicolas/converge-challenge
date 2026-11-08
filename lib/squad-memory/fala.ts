/**
 * Como o Totti fala da memória da squad na conversa da pré-entrevista: "da última vez vocês pediram X".
 * Só texto, sem estado: quem chama passa as regras ativas (snapshot da sessão) e os critérios do formato.
 */
import type { SquadRule } from "@/lib/contracts";

/** Quantas regras o Totti cita numa fala. O resto continua valendo, só não é dito. */
export const MAX_REGRAS_NA_FALA = 2;

/**
 * A regra como pedido do time, para entrar no meio da frase:
 * "Penaliza quem escolhe o banco sem estimar o volume" → "penalizar quem escolhe o banco sem estimar o volume";
 * "Valoriza modelagem de dados: o Tech Lead pediu..." → "valorizar modelagem de dados" (sem a explicação depois dos dois-pontos).
 */
export function pedidoDaRegra(texto: string): string {
  const curto = texto
    .split(":")[0]
    .trim()
    .replace(/[.;]+$/, "");
  const verbo = curto.match(/^(valoriza|penaliza)\b\s*/i);
  if (verbo) return `${verbo[1].toLowerCase()}r ${curto.slice(verbo[0].length)}`.trim();
  return curto.replace(/^([A-ZÀ-Ú])(?=[a-zà-ú])/, (l) => l.toLowerCase());
}

/** As regras que pesam em algum critério deste formato (uma regra de casos de borda não aparece num system design). */
export function regrasDoFormato(regras: SquadRule[] | undefined, criteriosDoFormato: string[]): SquadRule[] {
  return (regras ?? []).filter((r) => criteriosDoFormato.includes(r.criterion));
}

function pedidos(regras: SquadRule[]): string | undefined {
  const lista = regras.slice(0, MAX_REGRAS_NA_FALA).map((r) => pedidoDaRegra(r.text));
  if (lista.length === 0) return undefined;
  return lista.length === 1 ? lista[0] : `${lista.slice(0, -1).join(", ")} e ${lista.at(-1)}`;
}

/** Fechamento da abertura quando não há outra pergunta: uma pergunta só, que já confirma o resto. */
export function perguntaDaMemoria(regras: SquadRule[]): string | undefined {
  const x = pedidos(regras);
  return x ? `Da última vez vocês pediram para ${x}. Mantenho isso e sigo assim, ou quer mudar alguma coisa?` : undefined;
}

/** Quando a abertura já termina com outra pergunta (formato, nível), a memória entra como afirmação. */
export function afirmacaoDaMemoria(regras: SquadRule[]): string | undefined {
  const x = pedidos(regras);
  return x ? `Da última vez vocês pediram para ${x}, e eu mantenho.` : undefined;
}

/** No resumo final. */
export function resumoDaMemoria(regras: SquadRule[]): string | undefined {
  const x = pedidos(regras);
  return x ? `Mantenho o que o time já me ensinou: ${x}.` : undefined;
}
