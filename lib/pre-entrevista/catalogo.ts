/**
 * Catálogo de critérios-modelo por modo de entrevista, e o que cada formato consegue medir.
 *
 * É o ponto de partida do rascunho: a recrutadora não escreve critérios do zero,
 * o extrator só personaliza estes (texto, peso, o que entra e o que sai do foco).
 *
 * A tabela `MEDE` diz o que cada formato mede de cada área. É a única fonte de verdade sobre isso:
 * a frase que o Totti usa para explicar a avaliação (`COMO_AVALIAMOS`) é derivada dela.
 */
import type { FocusArea, InterviewMode } from "@/lib/contracts";

export interface CriterioModelo {
  id: string;
  name: string;
  focus: FocusArea;
  weight: number;
  /** Comportamento observável, no mesmo estilo de `lib/config/default.ts`. */
  description: string;
}

/**
 * Áreas com `nao_mede` não têm critério nesse formato. Uso de IA, por exemplo, só tem critério em system design,
 * onde o candidato desenha a parte de IA da solução.
 */
export const CATALOGO: Record<InterviewMode, CriterioModelo[]> = {
  live_coding: [
    {
      id: "abordagem",
      name: "Entendimento e abordagem",
      focus: "tecnico",
      weight: 1.25,
      description:
        "Bom: entende o problema e explica o plano antes de codar, justificando a escolha. Ruim: começa a codar sem explicar o plano.",
    },
    {
      id: "complexidade",
      name: "Complexidade",
      focus: "escala_produto",
      weight: 1,
      description:
        "Bom: diz o custo de tempo e memória e o que acontece com entradas grandes. Ruim: não sabe dizer a complexidade do que escreveu.",
    },
    {
      id: "corretude",
      name: "Corretude e código",
      focus: "tecnico",
      weight: 1,
      description: "Bom: passa nos testes escondidos, com nomes e estrutura claros. Ruim: código não passa nos testes ou é confuso de ler.",
    },
    {
      id: "bordas",
      name: "Casos de borda",
      focus: "tecnico",
      weight: 1,
      description:
        "Bom: trata entradas vazias, repetidas e limites sem ser lembrado. Ruim: só percebe os casos de borda quando o entrevistador aponta.",
    },
    {
      id: "comunicacao",
      name: "Comunicação e resposta a dicas",
      focus: "tecnico",
      weight: 1.25,
      description:
        "Bom: explica o raciocínio enquanto codifica e usa bem as dicas que pede. Ruim: fica em silêncio ou ignora as dicas recebidas.",
    },
    {
      id: "pressao_adaptacao",
      name: "Pressão e adaptação",
      focus: "pressao",
      weight: 1,
      description:
        "Bom: mantém a calma quando um teste falha ou trava, prioriza com o tempo curto e comunica o que vai tentar. Ruim: trava, se perde ou desiste quando algo dá errado.",
    },
  ],
  system_design: [
    {
      id: "requisitos",
      name: "Requisitos",
      focus: "tecnico",
      weight: 1.25,
      description:
        "Bom: levanta requisitos funcionais e não funcionais e confirma o escopo antes de desenhar. Ruim: começa a desenhar sem alinhar o que o sistema deve fazer.",
    },
    {
      id: "estimativa",
      name: "Estimativa de escala",
      focus: "escala_produto",
      weight: 1,
      description:
        "Bom: estima volume, requisições por segundo e armazenamento antes de escolher componentes. Ruim: escolhe componentes sem nenhum número de escala.",
    },
    {
      id: "componentes",
      name: "Componentes e dados",
      focus: "tecnico",
      weight: 1,
      description:
        "Bom: componentes e modelo de dados são coerentes entre si e com os requisitos. Ruim: o modelo de dados não bate com os componentes desenhados.",
    },
    {
      id: "tradeoffs",
      name: "Trade-offs",
      focus: "escala_produto",
      weight: 1.25,
      description:
        "Bom: compara alternativas e justifica a escolha com custos e riscos de cada uma. Ruim: escolhe tecnologias sem justificar nem citar alternativas.",
    },
    {
      id: "gargalos_falhas",
      name: "Gargalos e falhas",
      focus: "escala_produto",
      weight: 1,
      description:
        "Bom: aponta gargalos e pontos únicos de falha e propõe como mitigar. Ruim: desenha só o caminho feliz e não percebe os pontos de falha.",
    },
    {
      id: "uso_ia_criterio",
      name: "Solução com IA",
      focus: "uso_ia",
      weight: 1,
      description:
        "Bom: mostra onde o LLM entra, como o agente chama ferramentas e como trata erro e alucinação. Ruim: trata a IA como caixa-preta ('aí a IA resolve').",
    },
    {
      id: "pressao_adaptacao",
      name: "Pressão e adaptação",
      focus: "pressao",
      weight: 1,
      description:
        "Bom: defende a decisão com clareza quando é questionado ou o requisito muda. Ruim: se desmonta ou muda de ideia sem justificativa quando pressionado.",
    },
  ],
};

/** O que um formato consegue observar numa área. `nao_mede`: a área não entra nesse formato. */
export type NivelMedicao = "direto" | "indireto" | "nao_mede";

/**
 * O que cada formato mede de cada área, e como. `como` é uma oração que completa "Em <formato>, ..." (sem ponto final).
 * Quando a plataforma não tem sinal para uma área, o formato não mede: o Totti diz isso em vez de prometer.
 */
export const MEDE: Record<InterviewMode, Record<FocusArea, { nivel: NivelMedicao; como: string }>> = {
  live_coding: {
    tecnico: {
      nivel: "direto",
      como: "a gente olha o código escrito e as execuções de teste: se passa nos testes, se trata os casos de borda e se a estrutura é clara",
    },
    escala_produto: {
      nivel: "direto",
      como: "a gente olha se ele diz a complexidade da solução e o que acontece com entradas grandes, pela explicação falada e pelas perguntas do entrevistador",
    },
    pressao: {
      nivel: "indireto",
      como: "a gente vê como ele segue quando o requisito muda ou quando trava, pela explicação falada e pelas perguntas do entrevistador. Também conta quantas dicas ele pede",
    },
    uso_ia: {
      nivel: "nao_mede",
      como: "um problema de algoritmo na IDE não mostra se a pessoa sabe construir com IA",
    },
  },
  system_design: {
    tecnico: {
      nivel: "indireto",
      como: "a gente olha o desenho no quadro e a fala: se os componentes e o modelo de dados batem com os requisitos que ele levantou",
    },
    escala_produto: {
      nivel: "direto",
      como: "a gente olha a estimativa de escala, as alternativas que ele compara e os gargalos que aponta no desenho, pelo quadro e pela fala",
    },
    pressao: {
      nivel: "indireto",
      como: "a gente vê como ele defende as decisões quando o entrevistador questiona ou quando o requisito muda, pelas justificativas faladas",
    },
    uso_ia: {
      nivel: "direto",
      como: "quando o problema envolve IA, a gente vê onde o LLM entra no desenho, como o agente chama ferramentas e como ele trata erro, alucinação e custo, e o entrevistador aprofunda",
    },
  },
};

const SUJEITO: Record<InterviewMode, string> = { live_coding: "live coding", system_design: "system design" };

/** Frase que o Totti usa para explicar como cada área é observada em cada formato. Derivada de `MEDE`. */
function comoAvaliamos(): Record<InterviewMode, Record<FocusArea, string>> {
  const resultado = {} as Record<InterviewMode, Record<FocusArea, string>>;
  for (const modo of Object.keys(MEDE) as InterviewMode[]) {
    resultado[modo] = {} as Record<FocusArea, string>;
    for (const area of Object.keys(MEDE[modo]) as FocusArea[]) {
      resultado[modo][area] = `Em ${SUJEITO[modo]}, ${MEDE[modo][area].como}.`;
    }
  }
  return resultado;
}

export const COMO_AVALIAMOS: Record<InterviewMode, Record<FocusArea, string>> = comoAvaliamos();

/** A área é observada neste formato (direto ou indireto)? */
export function mede(modo: InterviewMode, area: FocusArea): boolean {
  return MEDE[modo][area].nivel !== "nao_mede";
}

/** Outro formato que mede a área, se houver. Usado para oferecer a troca. */
export function modoAlternativoQueMede(atual: InterviewMode, area: FocusArea): InterviewMode | undefined {
  return (Object.keys(MEDE) as InterviewMode[]).find((m) => m !== atual && mede(m, area));
}

/** Nome da área quando ela fica de fora da avaliação: "X ficam pra próxima etapa". */
export const ROTULO_NAO_AVALIADO: Record<FocusArea, string> = {
  tecnico: "algoritmos e código",
  pressao: "lidar com pressão e imprevistos",
  escala_produto: "escalabilidade",
  uso_ia: "conhecimento de IA aplicada",
};

/** Problema do agente de código quando a recrutadora não escolheu outro. */
export const PROBLEMA_PADRAO: Record<InterviewMode, string> = {
  live_coding: "two-sum",
  system_design: "encurtador-de-url",
};

/**
 * Problema padrão do modo e das áreas do foco. System design com IA no foco usa o chatbot de atendimento.
 * ATENÇÃO: `chatbot-atendimento-ia` precisa existir no catálogo de problemas do time do entrevistador.
 */
export function problemaPadrao(mode: InterviewMode, areas: FocusArea[]): string {
  if (mode === "system_design" && areas.includes("uso_ia")) return "chatbot-atendimento-ia";
  return PROBLEMA_PADRAO[mode];
}

/**
 * Critérios do catálogo cujo foco está nas áreas pedidas. Se nenhum casar,
 * devolve os 3 primeiros do modo. (Com `tecnico` no foco, os critérios de
 * `tecnico` já entram pelo próprio filtro.)
 */
export function criteriosIniciais(mode: InterviewMode, focus: FocusArea[]): CriterioModelo[] {
  const catalogo = CATALOGO[mode];
  const escolhidos = catalogo.filter((c) => focus.includes(c.focus));
  const base = escolhidos.length > 0 ? escolhidos : catalogo.slice(0, 3);
  return base.map((c) => ({ ...c }));
}

const IDS_DO_CATALOGO = new Set(Object.values(CATALOGO).flatMap((lista) => lista.map((c) => c.id)));

/**
 * Critérios que fazem sentido para o formato e as áreas ativas, a partir dos atuais. Usado na revisão,
 * quando a recrutadora troca o formato ou liga/desliga uma área:
 *  - fica quem é do catálogo deste formato, ou critério próprio dela, com a área ainda ativa (com as edições);
 *  - sai critério do outro formato e de área desligada;
 *  - área ativa sem nenhum critério ganha os do catálogo do formato.
 * Função pura.
 */
export function ajustarCriterios<C extends CriterioModelo>(mode: InterviewMode, areas: FocusArea[], atuais: C[]): CriterioModelo[] {
  const doFormato = new Set(CATALOGO[mode].map((c) => c.id));
  const ficam: CriterioModelo[] = atuais.filter(
    (c) => areas.includes(c.focus) && (doFormato.has(c.id) || !IDS_DO_CATALOGO.has(c.id)),
  );
  for (const area of areas) {
    if (ficam.some((c) => c.focus === area)) continue;
    ficam.push(...CATALOGO[mode].filter((c) => c.focus === area).map((c) => ({ ...c })));
  }
  return ficam.length > 0 ? ficam : criteriosIniciais(mode, areas);
}
