/**
 * Kit de system design com IA aplicada: a rubrica de system design mais o critério de uso de IA. É o kit da troca
 * que mede uso de IA (pré-entrevista: `chatbot-atendimento-ia`). Só no servidor.
 */
import type { Criterio, Kit } from "./tipos";
import { KIT_SYSTEM_DESIGN } from "./system-design";
import { RUBRICA_SYSTEM_DESIGN } from "./rubrica-system-design";

export const CRITERIO_USO_IA: Criterio = {
  id: "uso_ia",
  nome: "IA aplicada (modelo de linguagem no desenho)",
  niveis: {
    1: "Trata o modelo como caixa-preta que sempre acerta; manda tudo no prompt",
    2: "Cita RAG ou embeddings sem explicar como entram no fluxo",
    3: "Desenha a recuperação de contexto e trata custo, latência e falha do provedor",
    4: "Mede qualidade (alucinação, acerto), protege dados e decide quando passar para humano",
  },
};

export const KIT_SYSTEM_DESIGN_IA: Kit = {
  ...KIT_SYSTEM_DESIGN,
  id: "system_design_ia",
  area: "system design com IA aplicada",
  criterios: [...RUBRICA_SYSTEM_DESIGN, CRITERIO_USO_IA],
  tiposPergunta: [
    ...KIT_SYSTEM_DESIGN.tiposPergunta,
    {
      nome: "Qualidade do modelo",
      exemplo: "Como você descobre que o bot está inventando resposta?",
      revela: "Se avalia o modelo em vez de confiar nele",
    },
  ],
  termosTranscricao: [
    ...KIT_SYSTEM_DESIGN.termosTranscricao,
    "RAG", "embedding", "busca vetorial", "LLM", "prompt", "token", "alucinação", "streaming", "rate limit",
  ],
  problemas: [
    {
      id: "chatbot_atendimento_ia",
      titulo: "Chatbot de atendimento com IA",
      enunciado:
        "Projete o atendimento automático de uma empresa: um chatbot com modelo de linguagem que responde clientes usando a base de conhecimento da empresa e passa para um atendente humano quando precisa.",
      falaDoDesafio:
        "Hoje a conversa é sobre um chatbot de atendimento que usa um modelo de linguagem: o cliente pergunta, o bot responde com base no que a empresa sabe, e quando não dá conta passa pra uma pessoa. Muita coisa ficou de fora do enunciado de propósito, então pergunte o que quiser antes de desenhar. E vá pensando em voz alta, que é o seu raciocínio que eu quero acompanhar.",
      ficha: [
        { pergunta: "Volume?", resposta: "200 mil conversas por dia, picos de 300 conversas simultâneas por segundo no horário comercial" },
        { pergunta: "Base de conhecimento?", resposta: "~50 mil documentos (políticas, manuais, FAQ), atualizados todo dia" },
        { pergunta: "Tempo de resposta?", resposta: "Primeira palavra em menos de 2 segundos; resposta completa em até 8" },
        { pergunta: "Modelo de linguagem?", resposta: "API de um provedor externo, cobrada por token, com limite de requisições por minuto" },
        { pergunta: "Dados do cliente?", resposta: "O bot pode consultar pedidos do cliente logado; dados pessoais não podem ir para logs nem para o provedor sem mascarar" },
        { pergunta: "Passar para humano?", resposta: "Sim, quando o cliente pede ou o bot não tem confiança; o atendente vê o histórico" },
        { pergunta: "Qualidade?", resposta: "Resposta inventada é o pior erro; o time quer medir acerto e taxa de passagem para humano" },
        { pergunta: "Custo?", resposta: "Orçamento fixo por mês para o provedor; precisa caber" },
      ],
      sinaisEsperados: [
        "Recuperação de contexto (RAG): documentos divididos em trechos, embeddings e busca vetorial antes de chamar o modelo",
        "Pipeline de ingestão que reindexa a base quando os documentos mudam",
        "Resposta citando a fonte, ou recusa quando a busca não traz contexto suficiente",
        "Streaming da resposta para cumprir o tempo da primeira palavra",
        "Fila, limite de taxa e nova tentativa na chamada ao provedor, com alternativa quando ele cai",
        "Cache de respostas para perguntas frequentes, para custo e latência",
        "Mascarar dados pessoais antes do provedor e dos logs",
        "Avaliação contínua (conjunto de perguntas de referência, feedback do cliente) e passagem para humano com histórico",
      ],
      armadilhas: [
        "Mandar a base inteira no prompt, sem recuperação",
        "Confiar na resposta do modelo sem fonte nem forma de medir alucinação",
        "Chamada síncrona ao provedor sem timeout, limite de taxa ou alternativa",
        "Ignorar custo por token",
        "Mandar dados pessoais crus para o provedor",
      ],
      perguntasSugeridas: [
        "Como o bot sabe o que está na base de conhecimento?",
        "Como você descobre que ele está inventando resposta?",
        "E se o provedor do modelo ficar fora do ar ou estourar o limite?",
        "Quanto isso custa por mês, e como você baixaria esse custo?",
      ],
    },
  ],
};
