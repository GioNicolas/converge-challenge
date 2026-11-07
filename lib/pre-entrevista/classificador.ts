/**
 * Classificador da vaga (Jev).
 *
 * Recebe a vaga que a recrutadora colou e decide, antes da conversa por voz:
 *  - o modo da entrevista (live coding × system design)
 *  - a senioridade
 *  - quanto cada área de foco pesa
 *
 * O Jev funciona melhor com contexto estruturado: por isso cada opção vem com
 * definição, sinais na vaga e exemplos, e cada régua de foco é descrita nível a nível.
 * Decisões com confiança baixa voltam em `confirmar` — o agente de voz pergunta
 * em vez de sugerir.
 */
import { choice, score } from "@typesafe-ai/sdk";
import type { FocusArea, InterviewMode, InterviewConfig } from "@/lib/contracts";
import { jev } from "./jev";

export interface Vaga {
  roleTitle: string;
  jobDescription: string;
  /** Contexto extra opcional: empresa, time, produto, momento da contratação. */
  context?: string;
}

export interface Decisao<T extends string> {
  value: T;
  confidence: number;
  probabilities: Record<T, number>;
}

export interface FocoSugerido {
  area: FocusArea;
  /** Nota esperada de 0 (irrelevante) a 3 (central para a vaga). */
  score: number;
  /** Probabilidade de a área ser pelo menos "importante" (nota ≥ 2). Decide se entra no foco. */
  pImportante: number;
}

export interface Classificacao {
  mode: Decisao<InterviewMode>;
  seniority: Decisao<InterviewConfig["seniority"]>;
  /** Todas as áreas, da mais para a menos importante. */
  focusScores: FocoSugerido[];
  /** Áreas selecionadas com pesos que somam 1 — já no formato do `InterviewConfig`. */
  focus: InterviewConfig["focus"];
  /** Decisões que o agente deve perguntar em vez de sugerir. */
  confirmar: Array<"mode" | "seniority" | "focus">;
  usage: { inputTokens: number | null; ms: number };
  /** Request exato enviado ao Jev (state + perguntas), para o log. */
  request: { state: unknown; questions: unknown };
  /** Respostas cruas do Jev por pergunta, como o SDK devolveu. */
  answers: unknown;
  /** Modelo que respondeu, como o Jev informou. */
  model: string;
}

/** Abaixo disso, o agente pergunta em vez de sugerir. */
export const CONFIANCA_MINIMA = 0.7;
/** Uma área entra no foco se a chance de ser "importante" ou "central" passa disso. */
const P_MINIMA_FOCO = 0.5;
/** Entre esses limites a área está em cima do muro: o agente confirma com a recrutadora. */
const FAIXA_INCERTA: [number, number] = [0.3, 0.7];
const MAX_AREAS = 3;

// ---------------------------------------------------------------------------
// Contexto da tarefa (vai no `state` junto com a vaga)
// ---------------------------------------------------------------------------

const TAREFA = {
  objetivo:
    "Configurar a entrevista técnica de uma plataforma de recrutamento. Um agente de IA vai entrevistar " +
    "candidatos para a vaga abaixo; as decisões aqui definem o formato e o que será avaliado.",
  formatos_disponiveis: {
    live_coding:
      "Candidato resolve um problema de algoritmo/estrutura de dados numa IDE no navegador, estilo LeetCode/NeetCode, em ~30–45 min.",
    system_design:
      "Candidato desenha a arquitetura de um sistema num quadro (Excalidraw), discutindo componentes, dados, escala e trade-offs, em ~45–60 min.",
  },
  como_decidir:
    "Avalie o que o dia a dia da vaga realmente exige, não só palavras-chave. Responsabilidades contam mais " +
    "que a lista de tecnologias. Na dúvida entre os formatos, pese a senioridade: júnior quase nunca faz system design.",
};

// ---------------------------------------------------------------------------
// Perguntas
// ---------------------------------------------------------------------------

const MODO = choice("Qual formato de entrevista técnica avalia melhor um candidato para esta vaga?", {
  live_coding: {
    formato: TAREFA.formatos_disponiveis.live_coding,
    indicado_quando: [
      "o trabalho principal é implementar funcionalidades, escrever e manter código",
      "a vaga é júnior, estágio ou pleno inicial",
      "a vaga pede lógica de programação, algoritmos, estruturas de dados ou otimização de código",
      "o escopo é um componente, serviço ou tela, não o sistema inteiro",
      "vagas de dados/ML focadas em implementar modelos, pipelines ou scripts",
    ],
    cargos_tipicos: ["Desenvolvedor(a) Júnior/Pleno", "Engenheiro(a) de Software", "Frontend", "Mobile", "Estágio", "Engenheiro(a) de ML"],
  },
  system_design: {
    formato: TAREFA.formatos_disponiveis.system_design,
    indicado_quando: [
      "a pessoa vai desenhar, decidir ou evoluir a arquitetura de sistemas",
      "a vaga é sênior, staff, principal, tech lead ou arquiteto(a)",
      "menciona sistemas distribuídos, microsserviços, filas, cache, alta disponibilidade, escala de milhões de usuários/requisições",
      "menciona decisões técnicas de longo prazo, trade-offs, confiabilidade, observabilidade ou custo de infraestrutura",
      "a pessoa vai liderar tecnicamente outras pessoas ou times",
    ],
    cargos_tipicos: ["Engenheiro(a) Sênior/Staff", "Tech Lead", "Arquiteto(a) de Software", "Engenheiro(a) de Plataforma", "SRE Sênior"],
  },
});

const SENIORIDADE = choice("Qual a senioridade desta vaga?", {
  junior: {
    sinais: [
      "estágio, trainee, júnior, primeiro emprego",
      "até ~2 anos de experiência",
      "vai trabalhar com supervisão e aprender com o time",
      "tarefas bem definidas por outra pessoa",
    ],
  },
  pleno: {
    sinais: [
      "pleno, nível II, ~2 a 5 anos de experiência",
      "entrega funcionalidades de ponta a ponta com autonomia",
      "participa de decisões técnicas do time, mas não as lidera",
    ],
  },
  senior: {
    sinais: [
      "sênior, staff, principal, especialista, tech lead, arquiteto(a)",
      "5+ anos de experiência",
      "define arquitetura, mentora outras pessoas, lidera iniciativas técnicas",
      "responsável por decisões com impacto em vários times ou no produto",
    ],
  },
});

/** Régua comum de 0 a 3, especializada por área. */
function reguaFoco(nome: string, o_que_e: string, sinais: string[]) {
  return score(
    {
      pergunta: `Quanto a área "${nome}" deve pesar na avaliação técnica de um candidato para esta vaga?`,
      area: nome,
      o_que_e,
      sinais_na_vaga_que_aumentam_o_peso: sinais,
    },
    [
      "Irrelevante: a vaga não exige isso nem dá sinais de que importe.",
      "Secundário: ajuda, mas não decide a contratação.",
      "Importante: a vaga exige claramente; um candidato fraco aqui seria um problema.",
      "Central: é o coração da vaga; deve ser o foco principal da entrevista.",
    ],
  );
}

const FOCOS = {
  tecnico: reguaFoco(
    "domínio técnico",
    "Domínio técnico de base: algoritmos, estruturas de dados, complexidade, corretude e qualidade do código (ou, em system design, domínio dos componentes e tecnologias).",
    [
      "exige forte base de computação, algoritmos ou estruturas de dados",
      "foco em implementação, qualidade e manutenção de código",
      "lista linguagens/tecnologias como requisito obrigatório",
      "vaga júnior/pleno de desenvolvimento (quase sempre importante)",
    ],
  ),
  pressao: reguaFoco(
    "pressão e adaptação",
    "Como a pessoa lida com tempo curto, ambiguidade, travadas, mudanças de requisito e provocações, mantendo a clareza.",
    [
      "startup, ambiente acelerado, prazos curtos, entregas rápidas",
      "plantão, on-call, incidentes em produção, suporte crítico",
      "requisitos ambíguos ou que mudam com frequência",
      "contato direto com clientes ou áreas de negócio sob pressão",
    ],
  ),
  escala_produto: reguaFoco(
    "escala e produto",
    "Pensa em escala, desempenho, trade-offs de arquitetura e evolução do produto; entende o impacto das decisões técnicas no negócio.",
    [
      "alto volume de usuários, dados ou requisições",
      "sistemas distribuídos, cache, filas, banco de dados em escala",
      "responsabilidade por arquitetura, custo ou confiabilidade",
      "visão de produto, métricas de negócio, decisões de priorização",
    ],
  ),
  uso_ia: reguaFoco(
    "IA aplicada",
    "Saber CONSTRUIR soluções com IA: agentes, LLMs, RAG, tool calling e integrações com modelos. " +
      "Não é usar ferramentas de codificação com IA (Copilot, Cursor): isso pesa pouco aqui.",
    [
      "menciona agentes, LLMs, RAG, tool calling ou avaliação de respostas de IA",
      "a empresa ou o produto é de IA, ou integra modelos de IA às funcionalidades",
      "vai construir ou integrar agentes, chatbots ou features com LLM",
      "pede experiência prática com APIs de modelos (OpenAI, Anthropic, open-source)",
    ],
  ),
} satisfies Record<FocusArea, ReturnType<typeof reguaFoco>>;

// ---------------------------------------------------------------------------

function decisao<T extends string>(r: { choice: T; confidence: number; probabilities: Record<T, number> }): Decisao<T> {
  return { value: r.choice, confidence: r.confidence, probabilities: { ...r.probabilities } };
}

/** Escolhe as áreas acima da nota mínima (no máximo 3) e normaliza os pesos para somar 1. */
export function pesosDoFoco(scores: FocoSugerido[]): InterviewConfig["focus"] {
  const ordenadas = [...scores].sort((a, b) => b.score - a.score);
  let escolhidas = ordenadas.filter((s) => s.pImportante >= P_MINIMA_FOCO).slice(0, MAX_AREAS);
  if (escolhidas.length === 0) escolhidas = ordenadas.slice(0, 1);
  const soma = escolhidas.reduce((acc, s) => acc + s.score, 0) || 1;
  const pesos = escolhidas.map((s) => ({ area: s.area, weight: Math.round((s.score / soma) * 100) / 100 }));
  // Corrige o arredondamento para a soma dar exatamente 1.
  const diff = Math.round((1 - pesos.reduce((acc, p) => acc + p.weight, 0)) * 100) / 100;
  pesos[0].weight = Math.round((pesos[0].weight + diff) * 100) / 100;
  return pesos;
}

export async function classificarVaga(vaga: Vaga): Promise<Classificacao> {
  const inicio = Date.now();
  const request = {
    state: {
      tarefa: TAREFA,
      vaga: {
        cargo: vaga.roleTitle,
        descricao: vaga.jobDescription,
        ...(vaga.context ? { contexto_adicional: vaga.context } : {}),
      },
    },
    questions: { modo: MODO, senioridade: SENIORIDADE, ...FOCOS },
  };
  const { answers, usage, model } = await jev().systemOne(request);

  const focusScores: FocoSugerido[] = (Object.keys(FOCOS) as FocusArea[])
    .map((area) => {
      const p = answers[area].probabilities;
      return { area, score: answers[area].score, pImportante: p[2] + p[3] };
    })
    .sort((a, b) => b.score - a.score);

  const mode = decisao<InterviewMode>(answers.modo);
  const seniority = decisao<InterviewConfig["seniority"]>(answers.senioridade);
  const focus = pesosDoFoco(focusScores);

  const confirmar: Classificacao["confirmar"] = [];
  if (mode.confidence < CONFIANCA_MINIMA) confirmar.push("mode");
  if (seniority.confidence < CONFIANCA_MINIMA) confirmar.push("seniority");
  if (focusScores.some((s) => s.pImportante > FAIXA_INCERTA[0] && s.pImportante < FAIXA_INCERTA[1])) confirmar.push("focus");

  return {
    mode,
    seniority,
    focusScores,
    focus,
    confirmar,
    usage: { inputTokens: usage.input_tokens, ms: Date.now() - inicio },
    request,
    answers,
    model,
  };
}
