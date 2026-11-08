/**
 * O que a tela "Como foi essa contratação?" recebe: cada contratação com os dias de casa, se já venceu a
 * experiência e, quando respondida, o ajuste que o Totti fez (as regras como estão agora na memória).
 */
import { empresaAtual, listarMotivosIgnorados, obterRegra } from "@/lib/squad-memory/store";
import type { MotivoIgnorado, RegraSquad } from "@/lib/squad-memory/tipos";
import { mudancaDaRegra } from "./ajuste";
import { diasDeCasa, garantiaDe, listarContratacoes, venceu } from "./store";
import type { Contratacao, Garantia } from "./tipos";

export type RegraAjustada = RegraSquad & { mudanca: ReturnType<typeof mudancaDaRegra> };

export interface ContratacaoVista extends Contratacao {
  dias: number;
  vencida: boolean;
  /** Só nas respondidas. Regra apagada na memória some daqui também. */
  ajuste?: { regras: RegraAjustada[]; ignorados: MotivoIgnorado[] };
}

export interface VisaoContratacoes {
  contratacoes: ContratacaoVista[];
  garantia: Garantia;
}

export function comMudanca(r: RegraSquad): RegraAjustada {
  return { ...r, mudanca: mudancaDaRegra(r) };
}

export function vistaDa(c: Contratacao, agora = Date.now()): ContratacaoVista {
  const vista: ContratacaoVista = { ...c, dias: diasDeCasa(c, agora), vencida: venceu(c, agora) };
  if (c.resultado) {
    const ids = new Set(c.resultado.ignorados);
    vista.ajuste = {
      regras: c.resultado.regras
        .map((id) => obterRegra(id))
        .filter((r): r is RegraSquad => !!r)
        .map(comMudanca),
      ignorados: listarMotivosIgnorados(c.empresaId).filter((m) => ids.has(m.id)),
    };
  }
  return vista;
}

export function visaoDasContratacoes(vagaId?: string, empresaId = empresaAtual(), agora = Date.now()): VisaoContratacoes {
  const lista = listarContratacoes(empresaId, vagaId, agora);
  return { contratacoes: lista.map((c) => vistaDa(c, agora)), garantia: garantiaDe(lista, agora) };
}
