// Máquina de estados da sessão (lado servidor): fases da entrevista + ciclo do plin.
// Reducer puro e sem I/O: recebe estado + evento + horário e devolve o novo estado + efeitos.
// O estado é JSON puro (sem Set, Map, Date, funções), então pode ir e voltar do banco.
// Quem chama (a rota) executa os efeitos: falar, persistir, disparar nova análise etc.
//
// Fases:  AGUARDANDO → APRESENTACAO → REQUISITOS → ALTO_NIVEL → APROFUNDAMENTO → FECHAMENTO → ENCERRADA
// Plin:   LIVRE → PLIN_PENDENTE (análise devolveu dúvida) → PERGUNTA_ATIVA (candidato clicou) → LIVRE
//
// Os nomes (fases, ciclo do plin, eventos) seguem os de `lib/sessao/estados.ts` do quadro.
import { sobreposicao } from "../guardas";
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
  /**
   * Como o candidato reagiu, lido pelo modelo da conversa: respondeu, disse que não sabe ou quis pular.
   * "nao_sabe" e "pulou" encerram o assunto: a análise não volta a ele. Ausente: ainda sem resposta.
   */
  desfecho?: Desfecho;
  /** O que ele respondeu (curto), para a análise não perguntar de novo o que já foi dito. */
  resposta?: string;
  /** Perguntas de continuação que o Totti emendou no mesmo fio, na conversa (no máximo MAX_SEGUIMENTOS). */
  seguimentos?: string[];
};

/** Quantas perguntas de continuação um fio aceita antes de a conversa mudar de assunto. */
export const MAX_SEGUIMENTOS = 2;

export const DESFECHOS = ["respondeu", "nao_sabe", "pulou"] as const;
export type Desfecho = (typeof DESFECHOS)[number];

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

/** A mudança no problema que o entrevistador já anunciou (uma por sessão). Só servidor. */
export type EmpecilhoAnunciado = {
  id: string;
  fala: string;
  requisito: string;
  /** O que a mudança pede do desenho (vai à análise e ao scorecard, nunca ao navegador). */
  exige: string;
  anunciadoEm: number;
  fase: Fase;
  forcado: boolean;
};

export type EstadoSessao = {
  fase: Fase;
  faseIniciadaEm: number | null;
  /** Quando a entrevista começou (COMECAR). Estados antigos não têm: o tempo decorrido é estimado pelas fases. */
  iniciadaEm?: number | null;
  tempos: Tempos;
  /** Plano de entrevista da vaga (pré-entrevista). Ausente/null: entrevista padrão. */
  plano?: PlanoDaSessao | null;

  plin: CicloPlin;
  perguntaPendente: PlinPendente | null;
  perguntaAtiva: PerguntaFeita | null;

  perguntasFeitas: number;
  /** A pergunta única do FECHAMENTO já foi feita? */
  perguntaFinalFeita: boolean;
  /** Convite de REQUISITOS já feito ou dispensado porque o candidato falou. Não conta na cota. */
  conviteFeito: boolean;
  /** Quando o candidato clicou na última pergunta (o intervalo entre perguntas conta do mais recente entre isto e `ultimaRespostaEm`). */
  ultimaPerguntaEm: number | null;
  /** Quando o candidato terminou de responder a última pergunta. */
  ultimaRespostaEm: number | null;
  /**
   * Quando o agente disse a última fala solta (resposta a uma dúvida, comentário, continuação). Uma pergunta nova
   * não sai logo depois dela. Ausente em estados guardados antes desse campo.
   */
  ultimaFalaDoAgenteEm?: number | null;

  /** Todas as perguntas feitas, com os elementos citados. */
  perguntas: PerguntaFeita[];
  /** Livro de observações (vira o scorecard). */
  observacoes: ObservacaoRegistrada[];
  /** Cobertura da rubrica: critério → evidências. Critérios novos entram quando aparecem. */
  cobertura: Record<string, EvidenciaDoCriterio>;
  /** Registro da conversa, em ordem. */
  conversa: FalaRegistrada[];
  /** Mudança no problema já anunciada. Ausente/null: ainda não (estados antigos não têm o campo). */
  empecilho?: EmpecilhoAnunciado | null;
  /** Quantas vezes o candidato disse que terminou ("pronto", "acho que é isso") e quando foi a última. */
  conclusoes?: number;
  ultimaConclusaoEm?: number | null;
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
  /** `perguntou`: a fala do Conversador terminou numa pergunta (v2); conta no intervalo antes do próximo plin. */
  | { tipo: "AGENTE_FALOU"; texto: string; perguntou?: boolean }
  /** O candidato disse que terminou (a etapa ou o desenho todo). É um marco: a próxima pergunta não espera o intervalo. */
  | { tipo: "CANDIDATO_CONCLUIU" }
  /** O modelo da conversa leu como o candidato reagiu a uma pergunta do agente (ver `PerguntaFeita.desfecho`). */
  | { tipo: "DESFECHO_DA_PERGUNTA"; numero: number; desfecho: Desfecho; resposta: string }
  /** O Totti emendou uma pergunta de continuação na resposta: o fio segue ativo. */
  | { tipo: "SEGUIMENTO_FEITO"; numero: number; pergunta: string }
  /** O entrevistador trouxe a mudança no problema (só a primeira vale). */
  | { tipo: "EMPECILHO_ANUNCIADO"; empecilho: Omit<EmpecilhoAnunciado, "anunciadoEm" | "fase"> };

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

/** Quanto da resposta do candidato fica guardado junto da pergunta (vai aos prompts). */
const MAX_CARACTERES_RESPOSTA = 300;

/** Mesma fala duas vezes seguidas (o /perguntar e o evento "resposta" registram a mesma fala): fica uma. */
export function conversaSemRepeticao(conversa: FalaRecente[]): FalaRecente[] {
  return conversa.filter((f, i) => i === 0 || f.quem !== conversa[i - 1].quem || f.texto.trim() !== conversa[i - 1].texto.trim());
}

/**
 * Tempo da entrevista para o agente responder "quanto tempo dura?" e "quanto falta?": duração total (o plano ou a
 * soma das fases), decorrido desde o começo e o que falta. Sem `iniciadaEm` (estado antigo), o decorrido soma as
 * fases já passadas pelo tempo previsto de cada uma.
 */
export function tempoDaEntrevista(estado: EstadoSessao, agora: number): { totalMin: number; decorridoMin: number; restanteMin: number } {
  const somaS = Object.values(estado.tempos).reduce<number>((s, t) => s + (t ?? 0), 0);
  const totalMin = Math.round(estado.plano?.duracaoMin ?? somaS / 60);
  let decorridoMs: number;
  if (estado.iniciadaEm) decorridoMs = agora - estado.iniciadaEm;
  else {
    const anteriores = FASES.slice(0, Math.max(0, FASES.indexOf(estado.fase)));
    const passadasS = anteriores.reduce((s, f) => s + (estado.tempos[f] ?? 0), 0);
    decorridoMs = passadasS * 1000 + (estado.faseIniciadaEm ? agora - estado.faseIniciadaEm : 0);
  }
  const decorridoMin = Math.max(0, Math.floor(decorridoMs / 60_000));
  return { totalMin, decorridoMin, restanteMin: Math.max(0, totalMin - decorridoMin) };
}

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
    empecilho: null,
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

/** Sobreposição de palavras a partir da qual duas evidências do mesmo critério e sinal são a mesma observação. */
export const LIMIAR_OBSERVACAO_REPETIDA = 0.6;

function registrarObservacoes(
  estado: EstadoSessao,
  observacoes: Observacao[],
  agora: number,
): EstadoSessao {
  // A mesma observação de novo (mesmo critério, mesmo sinal, quase as mesmas palavras) não entra: o modelo repetia
  // "desenhou telas sem alinhar requisitos" a cada análise, e o livro (e o relatório) ficavam com 4 cópias dela.
  const novas: Observacao[] = [];
  for (const o of observacoes) {
    const repetida = [...estado.observacoes, ...novas].some((a) =>
      a.criterio === o.criterio && a.sinal === o.sinal && sobreposicao(a.evidencia, o.evidencia) >= LIMIAR_OBSERVACAO_REPETIDA);
    if (!repetida) novas.push(o);
  }
  observacoes = novas;
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
    case "COMECAR": {
      if (estado.fase !== "AGUARDANDO") return nada;
      const t = mudarFase(estado, "APRESENTACAO", agora);
      return { ...t, estado: { ...t.estado, iniciadaEm: agora } };
    }

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
        numero: estado.perguntasFeitas + (estado.perguntas.some((p) => p.fase === "REQUISITOS") ? 1 : 0) + 1,
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
      // A marca de fim de resposta (evento "resposta" do quadro) chega depois que o /perguntar já gravou a fala,
      // e depois da réplica do agente: gravar de novo fazia parecer que o candidato repetiu o que disse, e o botão
      // "terminei" (sem texto) gravava uma fala vazia. No fim de resposta, só entra fala nova e não vazia.
      const texto = evento.texto.trim();
      const ultimaDoCandidato = estado.conversa.findLast((f) => f.quem === "candidato");
      const repetida = evento.fimDeResposta && (!texto || ultimaDoCandidato?.texto.trim() === texto);
      let comFala: EstadoSessao = repetida
        ? estado
        : { ...estado, conversa: [...estado.conversa, { quem: "candidato", texto: evento.texto, em: agora }] };
      if (estado.fase === "REQUISITOS" && texto) {
        comFala = { ...comFala, conviteFeito: true };
        // O convite perdeu o sentido mesmo se a fala chegou entre a análise e o clique.
        if (estado.plin === "PLIN_PENDENTE") {
          return {
            estado: { ...comFala, plin: "LIVRE", perguntaPendente: null },
            efeitos: [{ tipo: "PLIN_CANCELADO", motivo: "ok" }],
          };
        }
      }
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
      // Acabar o orçamento de perguntas não encerra o aprofundamento antes da hora: o relógio decide.
      return { estado: livre, efeitos };
    }

    case "DESFECHO_DA_PERGUNTA": {
      const i = estado.perguntas.findIndex((p) => p.numero === evento.numero);
      if (i < 0) return nada;
      const resposta = evento.resposta.trim().slice(0, MAX_CARACTERES_RESPOSTA);
      const atualizar = (p: PerguntaFeita): PerguntaFeita => ({ ...p, desfecho: evento.desfecho, resposta });
      return {
        estado: {
          ...estado,
          perguntas: estado.perguntas.map((p, j) => (j === i ? atualizar(p) : p)),
          perguntaAtiva: estado.perguntaAtiva?.numero === evento.numero ? atualizar(estado.perguntaAtiva) : estado.perguntaAtiva,
        },
        efeitos: [],
      };
    }

    case "SEGUIMENTO_FEITO": {
      const i = estado.perguntas.findIndex((p) => p.numero === evento.numero);
      if (i < 0) return nada;
      const atualizar = (p: PerguntaFeita): PerguntaFeita => ({ ...p, seguimentos: [...(p.seguimentos ?? []), evento.pergunta] });
      return {
        estado: {
          ...estado,
          perguntas: estado.perguntas.map((p, j) => (j === i ? atualizar(p) : p)),
          perguntaAtiva: estado.perguntaAtiva?.numero === evento.numero ? atualizar(estado.perguntaAtiva) : estado.perguntaAtiva,
        },
        efeitos: [],
      };
    }

    case "EMPECILHO_ANUNCIADO":
      if (estado.empecilho) return nada;
      return {
        estado: {
          ...estado,
          empecilho: { ...evento.empecilho, anunciadoEm: agora, fase: estado.fase },
          conversa: [...estado.conversa, { quem: "agente", texto: evento.empecilho.fala, em: agora }],
        },
        efeitos: [],
      };

    case "CANDIDATO_CONCLUIU":
      return { estado: { ...estado, conclusoes: (estado.conclusoes ?? 0) + 1, ultimaConclusaoEm: agora }, efeitos: [] };

    case "AGENTE_FALOU":
      return {
        estado: {
          ...estado,
          ultimaFalaDoAgenteEm: agora,
          conversa: [...estado.conversa, { quem: "agente", texto: evento.texto, em: agora }],
          ...(evento.perguntou ? { ultimaPerguntaEm: agora } : {}),
        },
        efeitos: [],
      };
  }
}
