// Único ponto de acesso do quadro ao servidor.
// Enquanto as rotas /api/* não existem, devolve dados de mentira.
// Para ligar no servidor real, troque só o corpo destas funções.

export type Fase =
  | "AGUARDANDO"
  | "APRESENTACAO"
  | "REQUISITOS"
  | "ALTO_NIVEL"
  | "APROFUNDAMENTO"
  | "FECHAMENTO"
  | "ENCERRADA";

export type Sessao = {
  sessao_id: string;
  problema: { titulo: string; enunciado: string };
  /** Duração de cada fase, em segundos. */
  tempos: Partial<Record<Fase, number>>;
};

// Só o enunciado vem ao navegador: a ficha de requisitos e a rubrica ficam no servidor.
export async function criarSessao(): Promise<Sessao> {
  return {
    sessao_id: "sessao-de-mentira",
    problema: {
      titulo: "Encurtador de URL",
      enunciado:
        "Projete um serviço como o bit.ly: recebe uma URL longa e devolve uma curta. Quem acessa a curta é redirecionado.",
    },
    tempos: {
      REQUISITOS: 5 * 60,
      ALTO_NIVEL: 10 * 60,
      APROFUNDAMENTO: 15 * 60,
      FECHAMENTO: 5 * 60,
    },
  };
}
