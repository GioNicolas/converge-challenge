/**
 * Cobertura: o que a conversa já deixou claro e o que ainda falta perguntar.
 *
 * O Jev responde, em uma chamada, sim/não para cada tópico (é ou não é coberto
 * na transcrição). Tópico com probabilidade de "sim" de pelo menos 0,6 está coberto.
 * O agente de voz usa `sugestao` para perguntar o que falta.
 */
import { noul } from "@typesafe-ai/sdk";
import type { FocusArea } from "@/lib/contracts";
import { jev } from "./jev";
import type { Rascunho, Turno } from "./rascunho";

export interface Topico {
  id: string;
  /** Pergunta de sim/não que o Jev responde sobre a transcrição. */
  pergunta: string;
  /** Como o agente de voz pergunta, em pt-BR, uma pergunta só. */
  sugestao: string;
  sinal_sim: string;
  sinal_nao: string;
}

export interface Cobertura {
  /** Probabilidade de cada tópico estar coberto, por id. */
  cobertura: Record<string, number>;
  /** Tópicos ainda não cobertos, na ordem de prioridade. */
  faltando: Topico[];
  ms: number;
}

const LIMIAR_COBERTURA = 0.6;

const NOME_AREA: Record<FocusArea, string> = {
  tecnico: "domínio técnico",
  pressao: "pressão e adaptação",
  escala_produto: "escala e produto",
  uso_ia: "uso de IA",
};

const DESCRICAO_MODO = {
  live_coding: "live coding, com código na IDE",
  system_design: "system design, desenhando a arquitetura num quadro",
};

const TAREFA_COBERTURA =
  "Você verifica quais tópicos de uma pré-entrevista já foram respondidos na transcrição. " +
  "Responda sim só se a recrutadora falou sobre o tópico (não o agente, que apenas perguntou). " +
  "Se ela respondeu de forma parcial ou vaga, responda não.";

/**
 * Lista de tópicos a partir do rascunho, na ordem de prioridade:
 * confirmações → bom/ruim por área (área de maior peso primeiro) → eliminatórios → duração → tom → dicas.
 */
export function topicosDo(r: Rascunho): Topico[] {
  const porPeso = [...r.focus].sort((a, b) => b.weight - a.weight);
  const nomesFoco = porPeso.map((f) => NOME_AREA[f.area]).join(", ");

  const topicos: Topico[] = [
    {
      id: "confirmou_modo",
      pergunta: `A recrutadora confirmou ou corrigiu o formato da entrevista (${DESCRICAO_MODO[r.mode]})?`,
      sugestao: `Pelo que vi da vaga, eu faria uma entrevista de ${DESCRICAO_MODO[r.mode]}. Faz sentido pra você?`,
      sinal_sim: "Ela concordou com o formato sugerido ou disse outro formato.",
      sinal_nao: "O formato nunca foi discutido.",
    },
    {
      id: "confirmou_senioridade",
      pergunta: `A recrutadora confirmou ou corrigiu a senioridade da vaga (${r.seniority})?`,
      sugestao: `Essa vaga é de nível ${r.seniority}, né? Confere?`,
      sinal_sim: "Ela confirmou ou corrigiu a senioridade.",
      sinal_nao: "A senioridade nunca foi confirmada nem corrigida.",
    },
    {
      id: "confirmou_focos",
      pergunta: `A recrutadora confirmou ou corrigiu as áreas de foco da avaliação (${nomesFoco})?`,
      sugestao: `Pra avaliação, eu daria mais peso a ${nomesFoco}. Acha que está certo?`,
      sinal_sim: "Ela concordou com as áreas de foco ou pediu mudanças nelas.",
      sinal_nao: "O foco da avaliação nunca foi discutido.",
    },
  ];

  for (const { area } of porPeso) {
    const nome = NOME_AREA[area];
    topicos.push(
      {
        id: `bom_${area}`,
        pergunta: `A recrutadora descreveu como seria um candidato excelente em ${nome}, com comportamentos observáveis?`,
        sugestao: `Em ${nome}, o que faria um candidato se destacar pra você?`,
        sinal_sim: `Ela descreveu sinais concretos de um candidato excelente em ${nome}.`,
        sinal_nao: `Ela não descreveu isso, ou falou de forma genérica, sem comportamento observável em ${nome}.`,
      },
      {
        id: `ruim_${area}`,
        pergunta: `A recrutadora disse o que faria descartar alguém, ou red flags, em ${nome}?`,
        sugestao: `E em ${nome}, o que te faria descartar um candidato?`,
        sinal_sim: `Ela deu exemplos do que seria um sinal ruim ou uma red flag em ${nome}.`,
        sinal_nao: `Ela não disse o que seria ruim em ${nome}.`,
      },
    );
  }

  topicos.push(
    {
      id: "eliminatorios",
      pergunta: "A recrutadora disse algo que reprova o candidato sozinho, independentemente do resto (eliminatório)?",
      sugestao: "Tem algo que seria eliminatório, que reprova o candidato sozinho?",
      sinal_sim: "Ela citou um ponto eliminatório específico.",
      sinal_nao: "Ela não citou nenhum ponto eliminatório.",
    },
    {
      id: "duracao",
      pergunta: "A recrutadora disse quanto tempo a entrevista deve durar?",
      sugestao: "Quanto tempo você quer reservar pra entrevista?",
      sinal_sim: "Ela disse uma duração em minutos.",
      sinal_nao: "A duração nunca foi mencionada.",
    },
    {
      id: "tom",
      pergunta: "A recrutadora disse que tom a entrevista deve ter, mais amigável ou mais pressionada?",
      sugestao: "Você prefere uma conversa mais amigável, ou que pressione mais o candidato?",
      sinal_sim: "Ela descreveu o tom da entrevista.",
      sinal_nao: "O tom da entrevista nunca foi mencionado.",
    },
    {
      id: "dicas",
      pergunta: "A recrutadora disse se o agente pode dar dicas ao candidato durante a entrevista, e em que situação?",
      sugestao: "Posso dar dicas se ele travar, ou prefere que ele se vire sozinho?",
      sinal_sim: "Ela disse se pode haver dicas e em que condições.",
      sinal_nao: "A política de dicas nunca foi discutida.",
    },
  );

  return topicos;
}

/**
 * Chama o Jev para os tópicos atuais. A cobertura é monotônica: para cada tópico, vale o
 * máximo entre a probabilidade anterior (`r.cobertura`) e a nova. Não muta `r`.
 */
export async function avaliarCobertura(r: Rascunho, transcricao: Turno[]): Promise<Cobertura> {
  const topicos = topicosDo(r);
  const inicio = Date.now();

  const { answers } = await jev().systemOne({
    state: {
      tarefa: TAREFA_COBERTURA,
      rascunho_atual: { mode: r.mode, seniority: r.seniority, focus: r.focus },
      transcricao,
    },
    questions: Object.fromEntries(topicos.map((t) => [t.id, noul(t.pergunta, { true: t.sinal_sim, false: t.sinal_nao })])),
  });

  const cobertura: Record<string, number> = { ...r.cobertura };
  for (const t of topicos) cobertura[t.id] = Math.max(r.cobertura[t.id] ?? 0, answers[t.id].noul);

  return {
    cobertura,
    faltando: topicos.filter((t) => cobertura[t.id] < LIMIAR_COBERTURA),
    ms: Date.now() - inicio,
  };
}

/** Grava a cobertura no rascunho e recalcula `pendencias`. Função pura. */
export function aplicarCobertura(r: Rascunho, cobertura: Record<string, number>): Rascunho {
  const pendencias = topicosDo(r)
    .filter((t) => (cobertura[t.id] ?? 0) < LIMIAR_COBERTURA)
    .map((t) => t.id);
  return { ...r, cobertura, pendencias };
}
