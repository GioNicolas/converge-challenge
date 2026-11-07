/**
 * Kit de demonstração: system design, problema "encurtador de URL".
 * Dados do planejamento (seções 7.1 e 7.2). Só existe no servidor.
 */
import { Kit } from "./tipos";

export const kitDemo: Kit = Kit.parse({
  id: "system_design",
  area: "system design",
  persona: "engenheiro de software sênior, que já projetou sistemas de alto tráfego em big techs",
  tipoEntrevista: "system design",
  modoLeitura: "grafo",
  criterios: [
    {
      id: "requisitos",
      nome: "Requisitos e escopo",
      niveis: {
        1: "Começou a desenhar sem perguntar nada",
        2: "Perguntou pouco, esqueceu a escala",
        3: "Levantou funcionalidades e escala",
        4: "Levantou, priorizou e definiu o que fica fora",
      },
    },
    {
      id: "componentes",
      nome: "Componentes e fluxo",
      niveis: {
        1: "Componentes soltos, fluxo confuso",
        2: "Fluxo principal existe, com lacunas",
        3: "Fluxo completo e coerente",
        4: "Completo, com responsabilidades bem separadas",
      },
    },
    {
      id: "escalabilidade",
      nome: "Escalabilidade",
      niveis: {
        1: "Não considerou carga",
        2: "Citou escalar sem dizer como",
        3: "Cache, réplica e balanceamento onde faz sentido",
        4: "Identificou gargalos com números e atacou cada um",
      },
    },
    {
      id: "dados",
      nome: "Dados e consistência",
      niveis: {
        1: "Escolheu o banco sem critério",
        2: "Escolha razoável sem justificar",
        3: "Justificou o modelo de dados e a consistência",
        4: "Discutiu particionamento, consistência e casos de falha",
      },
    },
    {
      id: "tradeoffs",
      nome: "Trade-offs",
      niveis: {
        1: "Não justifica escolhas",
        2: "Justifica quando perguntado, de forma vaga",
        3: "Justifica com prós e contras",
        4: "Compara alternativas espontaneamente",
      },
    },
    {
      id: "comunicacao",
      nome: "Comunicação",
      niveis: {
        1: "Respostas confusas ou evasivas",
        2: "Responde em parte, sem justificar",
        3: "Responde com clareza e justifica",
        4: "Responde com precisão e antecipa o que o entrevistador vai perguntar",
      },
    },
  ],
  tiposPergunta: [
    { nome: "Justificativa", exemplo: "Por que Postgres e não um banco chave-valor aqui?", revela: "Se a escolha foi pensada" },
    { nome: "Falha", exemplo: "O que acontece se esse serviço cair?", revela: "Resiliência, ponto único de falha" },
    { nome: "Escala", exemplo: "E se o tráfego crescer 10x?", revela: "Onde estão os gargalos" },
    { nome: "Mudança de requisito", exemplo: "Agora precisamos de estatísticas de cliques em tempo real. O que muda?", revela: "Se o desenho se adapta ou precisa ser refeito" },
    { nome: "Trade-off", exemplo: "O que você perde escolhendo consistência eventual?", revela: "Maturidade" },
    { nome: "Estimativa", exemplo: "Quanto de armazenamento isso ocupa em 5 anos?", revela: "Conta de guardanapo, noção de grandeza" },
  ],
  termosTranscricao: ["base62", "Redis", "Postgres", "CDN", "load balancer", "sharding", "TTL", "cache miss"],
  problemas: [
    {
      id: "encurtador_url",
      titulo: "Encurtador de URL",
      enunciado:
        "Projete um serviço como o bit.ly: recebe uma URL longa e devolve uma curta. Quem acessa a curta é redirecionado.",
      ficha: [
        { pergunta: "Quantas URLs novas?", resposta: "100 milhões por mês (~40 por segundo, picos de 400)" },
        { pergunta: "Quantos acessos?", resposta: "Leitura 100x maior que escrita (~4 mil por segundo, picos de 40 mil)" },
        { pergunta: "Por quanto tempo guardar?", resposta: "5 anos por padrão" },
        { pergunta: "O usuário escolhe o código curto?", resposta: "Opcional, é um bom ter" },
        { pergunta: "Precisa de estatísticas de cliques?", resposta: "Sim, mas podem ter alguns minutos de atraso" },
        { pergunta: "Precisa de login?", resposta: "Não para criar. Fora do escopo." },
        { pergunta: "Tamanho do código curto?", resposta: "O menor possível; 7 caracteres está bom" },
        { pergunta: "Disponibilidade?", resposta: "Alta: redirecionamento fora do ar é o pior cenário" },
        { pergunta: "Latência do redirecionamento?", resposta: "Menos de 100 ms" },
      ],
      sinaisEsperados: [
        "API separada para criar e para redirecionar",
        "Geração de ID única (contador, hash ou base62)",
        "Banco chave-valor ou SQL com índice",
        "Cache para leitura (ex.: Redis)",
        "CDN ou balanceador de carga",
        "Pensar em colisão de ID",
        "Opcional: fila para contar cliques sem atrasar o redirecionamento",
      ],
      armadilhas: [
        "Banco único sem réplica",
        "Sem cache, mesmo com leitura 100x maior",
        "Geração de ID com colisão",
        "Contar cliques de forma síncrona no redirecionamento",
      ],
      perguntasSugeridas: [
        "Como você garante que dois links não recebem o mesmo código?",
        "Onde está o gargalo com leitura 100x maior?",
        "Se o cache cair, o que acontece?",
      ],
    },
  ],
});
