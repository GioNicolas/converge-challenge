/**
 * Catálogo de critérios-modelo por modo de entrevista.
 *
 * É o ponto de partida do rascunho: a recrutadora não escreve critérios do zero,
 * o extrator só personaliza estes (texto, peso, o que entra e o que sai do foco).
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
      id: "uso_ia_criterio",
      name: "Uso de IA",
      focus: "uso_ia",
      weight: 1,
      description:
        "Bom: revisa o código gerado, explica o que ele faz antes de aceitar e aponta problemas. Ruim: cola a resposta sem entender e não sabe dizer por que funciona.",
    },
    {
      id: "pressao_adaptacao",
      name: "Pressão e adaptação",
      focus: "pressao",
      weight: 1,
      description:
        "Bom: mantém a clareza com tempo curto e quando o requisito muda. Ruim: trava, se perde ou desiste quando o requisito muda.",
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
      name: "Uso de IA",
      focus: "uso_ia",
      weight: 1,
      description: "Bom: revisa o que a IA sugere e explica por que aceitou ou descartou cada ponto. Ruim: aceita a sugestão sem checar.",
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

/** Problema do agente de código quando a recrutadora não escolheu outro. */
export const PROBLEMA_PADRAO: Record<InterviewMode, string> = {
  live_coding: "two-sum",
  system_design: "encurtador-de-url",
};

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
