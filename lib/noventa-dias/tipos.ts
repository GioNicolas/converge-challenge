/**
 * Ciclo dos 90 dias (F5): aos 90 dias de cada contratação (fim da experiência CLT), o gestor diz se deu certo.
 * A resposta fica ao lado do que a entrevista disse e vira até 2 regras na Memória Viva da Squad
 * (`lib/squad-memory/`, origem `resultado_90_dias`).
 */
import type { RecomendacaoTotti, RegraSquad, MotivoIgnorado } from "@/lib/squad-memory/tipos";

/** Prazo da experiência: a pergunta "como foi?" só abre depois dele. */
export const DIAS_DA_EXPERIENCIA = 90;

/** Uma nota da entrevista, como o relatório deu. */
export interface NotaDaEntrevista {
  /** Id do critério (o mesmo da memória da squad: `bordas`, `complexidade`, `estimativa`…). */
  id: string;
  nome: string;
  /** 1 a 4; null quando a entrevista não teve prova para dar nota. */
  nota: number | null;
}

/** O que a entrevista disse do candidato contratado. */
export interface EntrevistaDaContratacao {
  recomendacao: RecomendacaoTotti;
  /** Nota geral, de 1 a 4. */
  nota: number;
  criterios: NotaDaEntrevista[];
  /** Relatório completo, quando existe (sessão real). */
  sessaoId?: string;
}

/** A resposta do gestor aos 90 dias. */
export interface ResultadoNoventaDias {
  deuCerto: boolean;
  /** O critério em que a entrevista errou. Sem valor: a entrevista acertou. */
  criterioErrado?: string;
  /** O que surpreendeu, bom ou ruim (texto livre, passa pelo guarda-corpo). */
  surpresa?: string;
  /** ISO. */
  respondidoEm: string;
  /** Ids das regras que o Totti criou com esta resposta (para mostrar e para desfazer). */
  regras: string[];
  /** Ids dos trechos que o guarda-corpo ignorou. */
  ignorados: string[];
}

export interface Contratacao {
  id: string;
  empresaId: string;
  vagaId: string;
  vagaTitulo: string;
  candidato: string;
  /** Cargo em que entrou (ex.: "Backend Pleno"). */
  cargo: string;
  /** ISO da data de início. */
  contratadoEm: string;
  entrevista: EntrevistaDaContratacao;
  resultado?: ResultadoNoventaDias;
}

/** O que o Totti mudou com uma resposta, já pronto para a tela. */
export interface AjusteDoTotti {
  regras: RegraSquad[];
  ignorados: MotivoIgnorado[];
}

/** Indicador da garantia: das contratações que passaram dos 90 dias, quantas o gestor aprovou. */
export interface Garantia {
  aprovadas: number;
  /** Já responderam. */
  respondidas: number;
  /** Passaram dos 90 dias (respondidas ou não). */
  vencidas: number;
  /** Ainda dentro da experiência. */
  emExperiencia: number;
}
