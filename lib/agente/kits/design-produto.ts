/** Kit de design de produto: o segundo kit (demo de "outra área"). Só no servidor. */
import type { Criterio, Kit } from "./tipos";

/** 4 critérios universais (todo kit) + 2 da área (seção 7.3). */
const RUBRICA_DESIGN_PRODUTO: Criterio[] = [
  {
    id: "entendimento_problema",
    nome: "Entendimento do problema e requisitos",
    niveis: {
      1: "Foi direto para as telas sem perguntar nada sobre o problema",
      2: "Perguntou pouco, esqueceu usuário ou métrica",
      3: "Levantou o problema, o usuário, as restrições e o que é obrigatório",
      4: "Levantou, priorizou e definiu o que fica fora e como medir sucesso",
    },
  },
  {
    id: "estrutura_raciocinio",
    nome: "Estrutura do raciocínio",
    niveis: {
      1: "Telas soltas, sem fio condutor",
      2: "Há uma sequência, mas com lacunas ou ordem sem motivo",
      3: "Fluxo completo e coerente, com ordem das etapas explicada",
      4: "Fluxo completo, com alternativas consideradas e caminhos de exceção previstos",
    },
  },
  {
    id: "tradeoffs_priorizacao",
    nome: "Trade-offs e priorização",
    niveis: {
      1: "Não justifica escolhas",
      2: "Justifica quando perguntado, de forma vaga",
      3: "Justifica com prós e contras e respeita as restrições dadas",
      4: "Compara alternativas espontaneamente e prioriza pelo impacto no usuário",
    },
  },
  {
    id: "comunicacao",
    nome: "Comunicação",
    provaSoPorFala: true,
    niveis: {
      1: "Respostas confusas ou evasivas",
      2: "Responde em parte, sem justificar",
      3: "Responde com clareza e justifica",
      4: "Responde com precisão e antecipa o que o entrevistador vai perguntar",
    },
  },
  {
    id: "foco_usuario_jornada",
    nome: "Foco no usuário e na jornada",
    niveis: {
      1: "Não falou do usuário; desenhou para um usuário genérico",
      2: "Citou o usuário, mas as telas não refletem as necessidades dele",
      3: "Partiu de quem é o usuário e onde ele trava, e a jornada responde a isso",
      4: "Mapeou a jornada inteira, incluindo ajuda humana, retomada do progresso e como medir o resultado",
    },
  },
  {
    id: "clareza_interface",
    nome: "Clareza da interface (hierarquia, estados de erro, acessibilidade)",
    niveis: {
      1: "Telas sem hierarquia, sem estados de erro e sem acessibilidade",
      2: "Hierarquia razoável, mas o erro ou a acessibilidade só aparecem quando perguntados",
      3: "Hierarquia clara, estados de erro com orientação e preocupação com acessibilidade",
      4: "Hierarquia, erros, estados vazios e acessibilidade tratados de forma espontânea e consistente",
    },
  },
];

export const KIT_DESIGN_PRODUTO: Kit = {
  id: "design_produto",
  area: "design de produto",
  persona: "product designer sênior, que já liderou design de apps financeiros",
  tipoEntrevista: "design de produto",
  modoLeitura: "visual",
  criterios: RUBRICA_DESIGN_PRODUTO,
  tiposPergunta: [
    {
      nome: "E se der erro?",
      exemplo: "E se a selfie falhar três vezes?",
      revela: "Se há estados de erro com orientação clara",
    },
    {
      nome: "Acessibilidade",
      exemplo: "Como essa tela fica para quem enxerga pouco?",
      revela: "Se o design inclui baixa visão e outras limitações",
    },
    {
      nome: "Justificativa",
      exemplo: "Por que essa ordem das etapas?",
      revela: "Se a estrutura do fluxo foi pensada",
    },
    {
      nome: "Medição",
      exemplo: "Como você saberia que funcionou?",
      revela: "Se há métrica de sucesso e visão de resultado",
    },
    {
      nome: "Usuário",
      exemplo: "Quem é a pessoa que trava nessa etapa e por quê?",
      revela: "Foco no usuário em vez de nas telas",
    },
    {
      nome: "Trade-off",
      exemplo: "O que você perde ao dividir isso em mais etapas?",
      revela: "Maturidade e priorização",
    },
  ],
  termosTranscricao: [
    "onboarding", "wireframe", "affordance", "KYC", "funil", "NPS", "UX", "UI", "fluxo",
    "jornada", "persona", "protótipo", "heurística", "acessibilidade", "contraste",
    "tipografia", "hierarquia visual", "estado vazio", "estado de erro", "call to action",
    "CTA", "A/B test", "taxa de conversão", "taxa de abandono", "design system", "usabilidade",
    "baixa visão", "leitor de tela", "selfie", "biometria", "microcopy", "progress bar",
    "tela", "botão", "mobile first",
  ],
  problemas: [
    {
      id: "onboarding_60_mais",
      titulo: "Onboarding de banco digital para 60+",
      enunciado: "Redesenhe o cadastro de um banco digital para pessoas acima de 60 anos.",
      falaDoDesafio:
        "Hoje o desafio é repensar o cadastro de um banco digital, pensando em pessoas mais velhas. O enunciado é enxuto de propósito, então pergunte o que quiser antes de desenhar, e vá contando o que pensa enquanto desenha.",
      ficha: [
        { pergunta: "Qual o problema hoje?", resposta: "40% abandonam o cadastro, a maioria na etapa de selfie e documento" },
        { pergunta: "Plataforma?", resposta: "Celular (app)" },
        { pergunta: "O que é obrigatório?", resposta: "Dados pessoais, foto do documento e selfie (exigência legal)" },
        { pergunta: "Quem é o usuário?", resposta: "60+, pouca familiaridade com apps, muitos com a visão reduzida" },
        { pergunta: "Tem ajuda humana?", resposta: "Existe central por telefone, hoje fora do app" },
        { pergunta: "Como medir sucesso?", resposta: "Taxa de conclusão do cadastro e tempo até a primeira transação" },
        { pergunta: "Prazo ou restrição técnica?", resposta: "O fornecedor de verificação de identidade não muda" },
      ],
      sinaisEsperados: [
        "Entender quem é o usuário e onde ele trava",
        "Etapas curtas, com progresso visível",
        "Linguagem simples, fonte e botões grandes",
        "Tratar o erro (foto ruim, selfie recusada) com orientação clara",
        "Salvar o progresso para continuar depois",
        "Ajuda humana dentro do fluxo",
        "Dizer como vai medir o resultado",
      ],
      armadilhas: [
        "Ir direto para as telas sem falar do usuário",
        "Fluxo sem nenhum estado de erro",
        "Muitos campos numa tela só",
        "Ignorar acessibilidade",
        "Nenhuma métrica",
      ],
      perguntasSugeridas: [
        "E se a selfie falhar três vezes?",
        "Como essa tela fica para quem enxerga pouco?",
        "Por que essa ordem das etapas?",
        "Como você saberia que funcionou?",
      ],
    },
  ],
};
