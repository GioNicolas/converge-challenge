/**
 * A sala de quem entra pelo link do convite (`?convite=<entrevistaId>`): está aberta agora? Só servidor.
 * Sem convite, ou convite sem horário marcado, não há trava (é o link aberto da vaga, que a recrutadora
 * usa para testar e divulgar): devolve null.
 */
import { listarConvites } from "./store";
import { janelaDaSala, situacaoDaSala, type JanelaSala, type SituacaoSala } from "./janela";

export type EstadoSala = {
  situacao: SituacaoSala;
  janela: JanelaSala;
  agendadoPara: string;
  durationMin: number;
  cargo: string;
  /** Relógio do servidor, para a contagem na tela não depender do relógio do aparelho. */
  agora: number;
};

export async function salaDaEntrevista(entrevistaId: string | undefined): Promise<EstadoSala | null> {
  if (!entrevistaId) return null;
  const convite = (await listarConvites()).find((c) => c.entrevistaId === entrevistaId);
  if (!convite?.agendadoPara) return null;
  const janela = janelaDaSala(convite.agendadoPara, convite.durationMin);
  const agora = Date.now();
  return {
    situacao: situacaoDaSala(janela, agora),
    janela,
    agendadoPara: convite.agendadoPara,
    durationMin: convite.durationMin,
    cargo: convite.cargo,
    agora,
  };
}
