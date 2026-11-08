// Máquina de estados da sessão (lado servidor): fases da entrevista + ciclo do plin.
// Reducer puro e sem I/O: recebe estado + evento + horário e devolve o novo estado + efeitos.
// O estado é JSON puro (sem Set, Map, Date, funções), então pode ir e voltar do banco.
// Quem chama (a rota) executa os efeitos: falar, persistir, disparar nova análise etc.
//
// Fases:  AGUARDANDO → APRESENTACAO → REQUISITOS → ALTO_NIVEL → APROFUNDAMENTO → FECHAMENTO → ENCERRADA
// Plin:   LIVRE → PLIN_PENDENTE (análise devolveu dúvida) → PERGUNTA_ATIVA (candidato clicou) → LIVRE
//
// Os nomes (fases, ciclo do plin, eventos) seguem os de `lib/sessao/estados.ts` do quadro.
import type { PlanoDaSessao } from "../plano";
import { podeLevantarPlin, REGRAS_PADRAO, statusPermitido, type Regras } from "./politica";
import { FASES, type Fase, type FalaRecente, type Observacao, type RespostaAnalise } from "./tipos";

export type CicloPlin = "LIVRE" | "PLIN_PENDENTE" | "PERGUNTA_ATIVA";

/** Duração de cada fase em segundos (mesmo formato de `tempos` do POST /api/sessoes). */
export type Tempos = Partial<Record<Fase, number>>;

export const TEMPOS_PADRAO: Tempos = {
  REQUISITOS: 300,
  ALTO_NIVEL: 600,
  APROFUNDAMENTO: 900,
  FECHAMENTO: 300,
};

/** Dúvida esperando o clique do candidato. */
export type PlinPendente = RespostaAnalise & { criadoEm: number };

/** Pergunta que o candidato está respondendo (ou já respondeu, no registro). */
export type PerguntaFeita = {
  numero: number;
  status: RespostaAnalise["status"];
  pergunta: string;
  nota: string | null;
  /** Ids curtos do grafo que o agente circulou. */
  elementos: string[];
  visual?: RespostaAnalise["visual"];
  degrau: number | null;
  fase: Fase;
  feitaEm: number;
};

export type ObservacaoRegistrada = Observacao & {
  em: number;
  fase: Fase;
  /** Snapshot recebido pelo /analisar; horario = captura para análise, não criação do desenho.
   * Só o servidor preenche. O scorecard resolve o evento real com o mesmo grafo ao finalizar. */
  desenho?: { horario: string; grafo: string };
};

/** Quantas observações de cada sinal já existem para um critério da rubrica. */
export type EvidenciaDoCriterio = { positivo: number; negativo: number; neutro: number };

export type FalaRegistrada = FalaRecente & { em: number };

export type EstadoSessao = {
  fase: Fase;
  faseIniciadaEm: number | null;
  tempos: Tempos;
  /** Plano de entrevista da vaga (pré-entrevista). Ausente/null: entrevista padrão. */
  plano?: PlanoDaSessao | null;

  plin: CicloPlin;
  perguntaPendente: PlinPendente | null;
  perguntaAtiva: PerguntaFeita | null;

  perguntasFeitas: number;
  /** A pergunta única do FECHAMENTO já foi feita? */
  perguntaFinalFeita: boolean;
  /** O convite único de REQUISITOS (silêncio inicial) já foi feito? Ele não conta na cota de perguntas. */
  conviteFeito: boolean;
  /** Quando o candidato clicou na última pergunta (o intervalo de 60s conta daqui). */
  ultimaPerguntaEm: number | null;
  /** Quando o candidato terminou de responder a última pergunta. */
  ultimaRespostaEm: number | null;

  /** Todas as perguntas feitas, com os elementos citados. */
  perguntas: PerguntaFeita[];
  /** Livro de observações (vira o scorecard). */
  observacoes: ObservacaoRegistrada[];
  /** Cobertura da rubrica: critério → evidências. Critérios novos entram quando aparecem. */
  cobertura: Record<string, EvidenciaDoCriterio>;
  /** Registro da conversa, em ordem. */
  conversa: FalaRegistrada[];
};

export type EventoSessao =
  | { tipo: "COMECAR" }
  | { tipo: "APRESENTACAO_TERMINOU" }
  /** O candidato começou a desenhar: encerra REQUISITOS. */
  | { tipo: "CANDIDATO_DESENHOU" }
  /** O agente decide sair do alto nível e aprofundar. */
  | { tipo: "APROFUNDAR" }
  /** Passagem do tempo: avança a fase se o orçamento dela estourou. */
  | { tipo: "TICK" }
  | { tipo: "ENCERRAR" }
  /** O quadro é dono da fase: o servidor acompanha. Só avança (alvo anterior ou igual é ignorado). */
  | { tipo: "SINCRONIZAR_FASE"; fase: Fase }
  /** Resultado do /analisar (já passado por `filtrarResposta`). */
  | { tipo: "ANALISE_RECEBIDA"; resposta: RespostaAnalise }
  /** O candidato mexeu nestes elementos (ids curtos do grafo). */
  | { tipo: "ELEMENTOS_ALTERADOS"; ids: string[] }
  | { tipo: "PLIN_CLICADO" }
  | { tipo: "CANDIDATO_FALOU"; texto: string; fimDeResposta: boolean }
  | { tipo: "AGENTE_FALOU"; texto: string };

/** O que a rota precisa fazer depois da transição. */
export type Efeito =
  | { tipo: "FASE_MUDOU"; de: Fase; para: Fase }
  | { tipo: "PLIN_PENDENTE"; resposta: PlinPendente; substituiuAnterior: boolean }
  | { tipo: "PLIN_CANCELADO"; motivo: "ok" | "elementos_alterados" | "fase" }
  /** Rodar o /analisar de novo (resposta terminou, ou a dúvida pendente ficou velha). */
  | { tipo: "ANALISAR"; motivo: "resposta_terminou" | "plin_expirou" }
  | { tipo: "PERGUNTA_INICIADA"; pergunta: PerguntaFeita }
  | { tipo: "RESPOSTA_ENCERRADA"; numero: number }
  | { tipo: "SESSAO_ENCERRADA" };

export type Transicao = { estado: EstadoSessao; efeitos: Efeito[] };

export function estadoInicial(opcoes: { tempos?: Tempos; criterios?: string[]; plano?: PlanoDaSessao | null } = {}): EstadoSessao {
  return {
    fase: "AGUARDANDO",
    faseIniciadaEm: null,
    tempos: opcoes.tempos ?? TEMPOS_PADRAO,
    plano: opcoes.plano ?? null,
    plin: "LIVRE",
    perguntaPendente: null,
    perguntaAtiva: null,
    perguntasFeitas: 0,
    perguntaFinalFeita: false,
    conviteFeito: false,
    ultimaPerguntaEm: null,
    ultimaRespostaEm: null,
    perguntas: [],
    observacoes: [],
    cobertura: Object.fromEntries(
      (opcoes.criterios ?? []).map((c) => [c, { positivo: 0, negativo: 0, neutro: 0 }]),
    ),
    conversa: [],
  };
}

/** Critérios da rubrica que ainda não têm nenhuma evidência. */
export function criteriosSemEvidencia(estado: EstadoSessao): string[] {
  return Object.entries(estado.cobertura)
    .filter(([, e]) => e.positivo + e.negativo + e.neutro === 0)
    .map(([criterio]) => criterio);
}

const PROXIMA_FASE: Partial<Record<Fase, Fase>> = {
  APRESENTACAO: "REQUISITOS",
  REQUISITOS: "ALTO_NIVEL",
  ALTO_NIVEL: "APROFUNDAMENTO",
  APROFUNDAMENTO: "FECHAMENTO",
  FECHAMENTO: "ENCERRADA",
};

/** Muda de fase. Uma dúvida pendente que a nova fase não aceita é descartada. */
function mudarFase(estado: EstadoSessao, fase: Fase, agora: number): Transicao {
  const efeitos: Efeito[] = [{ tipo: "FASE_MUDOU", de: estado.fase, para: fase }];
  let novo: EstadoSessao = { ...estado, fase, faseIniciadaEm: agora };

  if (fase === "ENCERRADA") {
    novo = { ...novo, plin: "LIVRE", perguntaPendente: null, perguntaAtiva: null };
    if (estado.perguntaPendente) efeitos.push({ tipo: "PLIN_CANCELADO", motivo: "fase" });
    efeitos.push({ tipo: "SESSAO_ENCERRADA" });
  } else if (novo.perguntaPendente && !statusPermitido(fase, novo.perguntaPendente.status)) {
    novo = { ...novo, plin: "LIVRE", perguntaPendente: null };
    efeitos.push({ tipo: "PLIN_CANCELADO", motivo: "fase" });
  }
  return { estado: novo, efeitos };
}

function registrarObservacoes(
  estado: EstadoSessao,
  observacoes: Observacao[],
  agora: number,
): EstadoSessao {
  if (observacoes.length === 0) return estado;
  const cobertura = { ...estado.cobertura };
  for (const o of observacoes) {
    const atual = cobertura[o.criterio] ?? { positivo: 0, negativo: 0, neutro: 0 };
    cobertura[o.criterio] = { ...atual, [o.sinal]: atual[o.sinal] + 1 };
  }
  return {
    ...estado,
    cobertura,
    observacoes: [
      ...estado.observacoes,
      ...observacoes.map((o) => ({ ...o, em: agora, fase: estado.fase })),
    ],
  };
}

export function transicionar(
  estado: EstadoSessao,
  evento: EventoSessao,
  agora: number,
  regras: Regras = REGRAS_PADRAO,
): Transicao {
  const nada: Transicao = { estado, efeitos: [] };
  if (estado.fase === "ENCERRADA") return nada;

  switch (evento.tipo) {
    case "COMECAR":
      return estado.fase === "AGUARDANDO" ? mudarFase(estado, "APRESENTACAO", agora) : nada;

    case "APRESENTACAO_TERMINOU":
      return estado.fase === "APRESENTACAO" ? mudarFase(estado, "REQUISITOS", agora) : nada;

    case "CANDIDATO_DESENHOU":
      return estado.fase === "REQUISITOS" ? mudarFase(estado, "ALTO_NIVEL", agora) : nada;

    case "APROFUNDAR":
      return estado.fase === "ALTO_NIVEL" ? mudarFase(estado, "APROFUNDAMENTO", agora) : nada;

    case "TICK": {
      const proxima = PROXIMA_FASE[estado.fase];
      const duracao = estado.tempos[estado.fase];
      // Fase sem tempo configurado não acaba sozinha.
      if (!proxima || duracao === undefined || estado.faseIniciadaEm === null) return nada;
      return agora - estado.faseIniciadaEm >= duracao * 1000
        ? mudarFase(estado, proxima, agora)
        : nada;
    }

    case "ENCERRAR":
      return mudarFase(estado, "ENCERRADA", agora);

    case "SINCRONIZAR_FASE":
      return FASES.indexOf(evento.fase) > FASES.indexOf(estado.fase)
        ? mudarFase(estado, evento.fase, agora)
        : nada;

    case "ANALISE_RECEBIDA": {
      const { resposta } = evento;
      // As observações valem para o scorecard mesmo quando não viram plin.
      const comObservacoes = registrarObservacoes(estado, resposta.observacoes, agora);

      if (resposta.pergunta?.trim() && podeLevantarPlin(comObservacoes, resposta.status, agora, regras)) {
        // Uma dúvida nova substitui a pendente: a mais recente é a mais relevante.
        const pendente: PlinPendente = { ...resposta, criadoEm: agora };
        return {
          estado: { ...comObservacoes, plin: "PLIN_PENDENTE", perguntaPendente: pendente },
          efeitos: [
            {
              tipo: "PLIN_PENDENTE",
              resposta: pendente,
              substituiuAnterior: estado.perguntaPendente !== null,
            },
          ],
        };
      }
      if (resposta.status === "ok" && estado.plin === "PLIN_PENDENTE") {
        // O candidato resolveu sozinho antes de clicar: a dúvida pendente perdeu o sentido.
        return {
          estado: { ...comObservacoes, plin: "LIVRE", perguntaPendente: null },
          efeitos: [{ tipo: "PLIN_CANCELADO", motivo: "ok" }],
        };
      }
      return { estado: comObservacoes, efeitos: [] };
    }

    case "ELEMENTOS_ALTERADOS": {
      const pendente = estado.perguntaPendente;
      if (estado.plin !== "PLIN_PENDENTE" || !pendente) return nada;
      const mudou = pendente.elementos.some((id) => evento.ids.includes(id));
      if (!mudou) return nada;
      // O desenho citado mudou antes do clique: a dúvida pode estar velha. Descarta e reanalisa.
      return {
        estado: { ...estado, plin: "LIVRE", perguntaPendente: null },
        efeitos: [
          { tipo: "PLIN_CANCELADO", motivo: "elementos_alterados" },
          { tipo: "ANALISAR", motivo: "plin_expirou" },
        ],
      };
    }

    case "PLIN_CLICADO": {
      const pendente = estado.perguntaPendente;
      if (estado.plin !== "PLIN_PENDENTE" || !pendente) return nada;
      const pergunta: PerguntaFeita = {
        // Número único: o convite de REQUISITOS não conta na cota, mas ocupa um número.
        numero: estado.perguntasFeitas + (estado.conviteFeito ? 1 : 0) + 1,
        status: pendente.status,
        pergunta: pendente.pergunta ?? "",
        nota: pendente.nota,
        elementos: pendente.elementos,
        ...(pendente.visual ? { visual: pendente.visual } : {}),
        degrau: pendente.degrau,
        fase: estado.fase,
        feitaEm: agora,
      };
      return {
        estado: {
          ...estado,
          plin: "PERGUNTA_ATIVA",
          perguntaAtiva: pergunta,
          perguntaPendente: null,
          // O convite de REQUISITOS (silêncio inicial) não gasta a cota de perguntas do agente.
          perguntasFeitas: estado.fase === "REQUISITOS" ? estado.perguntasFeitas : estado.perguntasFeitas + 1,
          perguntaFinalFeita: estado.perguntaFinalFeita || estado.fase === "FECHAMENTO",
          conviteFeito: estado.conviteFeito || estado.fase === "REQUISITOS",
          ultimaPerguntaEm: agora,
          perguntas: [...estado.perguntas, pergunta],
          conversa: [...estado.conversa, { quem: "agente", texto: pergunta.pergunta, em: agora }],
        },
        efeitos: [{ tipo: "PERGUNTA_INICIADA", pergunta }],
      };
    }

    case "CANDIDATO_FALOU": {
      const comFala: EstadoSessao = {
        ...estado,
        conversa: [...estado.conversa, { quem: "candidato", texto: evento.texto, em: agora }],
      };
      const ativa = estado.perguntaAtiva;
      // A resposta só termina com a marca de fim vinda do texto do candidato.
      if (estado.plin !== "PERGUNTA_ATIVA" || !ativa || !evento.fimDeResposta) {
        return { estado: comFala, efeitos: [] };
      }
      const livre: EstadoSessao = {
        ...comFala,
        plin: "LIVRE",
        perguntaAtiva: null,
        ultimaRespostaEm: agora,
      };
      const efeitos: Efeito[] = [
        { tipo: "RESPOSTA_ENCERRADA", numero: ativa.numero },
        { tipo: "ANALISAR", motivo: "resposta_terminou" },
      ];
      // Atingiu o limite de perguntas no aprofundamento: segue para o fechamento (como no quadro).
      if (livre.fase === "APROFUNDAMENTO" && livre.perguntasFeitas >= regras.maxPerguntas) {
        const fechamento = mudarFase(livre, "FECHAMENTO", agora);
        return { estado: fechamento.estado, efeitos: [...efeitos, ...fechamento.efeitos] };
      }
      return { estado: livre, efeitos };
    }

    case "AGENTE_FALOU":
      return {
        estado: {
          ...estado,
          conversa: [...estado.conversa, { quem: "agente", texto: evento.texto, em: agora }],
        },
        efeitos: [],
      };
  }
}
