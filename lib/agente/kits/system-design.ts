/** Kit de system design: o primeiro kit e o da demo. Só no servidor. */
import type { Kit } from "./tipos";
import { RUBRICA_SYSTEM_DESIGN } from "./rubrica-system-design";

export const KIT_SYSTEM_DESIGN: Kit = {
  id: "system_design",
  area: "system design",
  persona: "engenheiro de software sênior",
  tipoEntrevista: "system design",
  modoLeitura: "grafo",
  criterios: RUBRICA_SYSTEM_DESIGN,
  tiposPergunta: [
    {
      nome: "Justificativa",
      exemplo: "Por que Postgres e não um banco chave-valor aqui?",
      revela: "Se a escolha foi pensada",
    },
    {
      nome: "Falha",
      exemplo: "O que acontece se esse serviço cair?",
      revela: "Resiliência, ponto único de falha",
    },
    {
      nome: "Escala",
      exemplo: "E se o tráfego crescer 10x?",
      revela: "Onde estão os gargalos",
    },
    {
      nome: "Mudança de requisito",
      exemplo: "Agora precisamos de estatísticas de cliques em tempo real. O que muda?",
      revela: "Se o desenho se adapta ou precisa ser refeito",
    },
    {
      nome: "Trade-off",
      exemplo: "O que você perde escolhendo consistência eventual?",
      revela: "Maturidade",
    },
    {
      nome: "Estimativa",
      exemplo: "Quanto de armazenamento isso ocupa em 5 anos?",
      revela: "Conta de guardanapo, noção de grandeza",
    },
  ],
  termosTranscricao: [
    "Redis", "Kafka", "load balancer", "TTL", "sharding", "Postgres", "idempotência",
    "WebSocket", "Cassandra", "API Gateway", "CDN", "cache", "réplica", "fila", "worker",
    "base62", "hash", "colisão", "ledger", "livro-razão", "saga", "fan-out", "push",
    "user ID", "chave-valor", "SQL", "NoSQL", "consistência eventual", "consistência forte",
    "particionamento", "rebalanceamento", "throughput", "latência", "timeout", "retry",
    "reconciliação", "antifraude", "microsserviço", "RabbitMQ", "DynamoDB", "MongoDB",
    "Memcached", "S3", "Nginx", "HTTP", "gRPC", "REST", "failover", "SPOF", "CAP",
    "RAG", "embedding", "busca vetorial", "LLM", "prompt", "token", "alucinação", "streaming", "rate limit",
  ],
  problemas: [
    {
      id: "encurtador_url",
      titulo: "Encurtador de URL",
      enunciado:
        "Projete um serviço como o bit.ly: recebe uma URL longa e devolve uma curta. Quem acessa a curta é redirecionado.",
      falaDoDesafio:
        "Hoje a conversa é sobre um encurtador de links, tipo o bit.ly: a pessoa cola um endereço comprido, recebe um curtinho, e quem abrir o curto é levado ao original. O problema é aberto de propósito, então pergunte o que quiser antes de desenhar. E vá pensando em voz alta, que o que me interessa é entender como você pensa.",
      ficha: [
        { pergunta: "Quantas URLs novas?", resposta: "100 milhões por mês (~40 por segundo, picos de 400)" },
        { pergunta: "Quantos acessos?", resposta: "Leitura 100x maior que escrita (~4 mil por segundo, picos de 40 mil)" },
        { pergunta: "Por quanto tempo guardar?", resposta: "5 anos por padrão" },
        { pergunta: "O usuário escolhe o código curto?", resposta: "Opcional, é um \"bom ter\"" },
        { pergunta: "Precisa de estatísticas de cliques?", resposta: "Sim, mas podem ter alguns minutos de atraso" },
        { pergunta: "Precisa de login?", resposta: "Não para criar. Fora do escopo." },
        { pergunta: "Tamanho do código curto?", resposta: "O menor possível; 7 caracteres está bom" },
        { pergunta: "Disponibilidade?", resposta: "Alta: redirecionamento fora do ar é o pior cenário" },
        { pergunta: "Tempo de resposta do redirecionamento?", resposta: "Menos de 100 ms" },
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
    {
      id: "chat_tempo_real",
      titulo: "Chat em tempo real",
      enunciado:
        "Projete um app de mensagens: conversas um a um e em grupo, com entrega em tempo real.",
      falaDoDesafio:
        "Hoje o tema é um aplicativo de mensagens, desses com conversa entre duas pessoas e em grupo, em que a mensagem chega na hora. O enunciado é curto de propósito, então pergunte o que precisar antes de desenhar. Vá contando o que pensa enquanto desenha, que é isso que eu quero acompanhar.",
      ficha: [
        { pergunta: "Quantos usuários?", resposta: "50 milhões ativos por dia, 10 milhões online ao mesmo tempo no pico" },
        { pergunta: "Volume de mensagens?", resposta: "~1 bilhão por dia (~12 mil por segundo, picos de 50 mil)" },
        { pergunta: "Grupos?", resposta: "Sim, até 256 pessoas" },
        { pergunta: "Mídia (foto, vídeo)?", resposta: "Fora do escopo; só texto" },
        { pergunta: "Histórico?", resposta: "Guardar para sempre; sincronizar entre dispositivos" },
        { pergunta: "Status online e \"visto\"?", resposta: "Online sim; \"visto\" é bom ter" },
        { pergunta: "Usuário offline?", resposta: "Recebe quando voltar, e recebe notificação push" },
        { pergunta: "Ordem das mensagens?", resposta: "Dentro de uma conversa, precisa manter a ordem" },
      ],
      sinaisEsperados: [
        "Conexões persistentes (WebSocket) num serviço de \"gateway\"",
        "Registro de qual servidor guarda a conexão de cada usuário (ex.: Redis)",
        "Fila ou barramento entre os servidores (ex.: Kafka)",
        "Banco que escala na escrita e é particionado por conversa (ex.: Cassandra)",
        "ID ordenável por conversa",
        "Serviço de push para quem está offline",
        "Fan-out nos grupos",
      ],
      armadilhas: [
        "Um único servidor de WebSocket",
        "Polling HTTP a cada segundo",
        "Banco relacional único sem particionamento",
        "Ignorar o usuário offline",
        "Ordem garantida só pelo relógio do servidor",
      ],
      perguntasSugeridas: [
        "Como a mensagem chega se o destinatário está conectado em outro servidor?",
        "E se ele estiver offline?",
        "Como você garante a ordem dentro de uma conversa?",
        "Como fica um grupo de 256 pessoas?",
      ],
    },
    {
      id: "pagamentos_instantaneos",
      titulo: "Pagamentos instantâneos",
      enunciado:
        "Projete o sistema de transferências instantâneas de um banco digital: o cliente envia dinheiro para outra conta e o recebedor vê na hora.",
      falaDoDesafio:
        "Hoje vamos falar de transferências instantâneas num banco digital: o cliente manda dinheiro pra outra conta e quem recebe vê o valor na hora. Tem muita coisa que não foi dita, então pergunte à vontade antes de começar a desenhar. E pense em voz alta, que o caminho que você escolhe me importa mais que o desenho final.",
      ficha: [
        { pergunta: "Volume?", resposta: "20 milhões de transferências por dia, picos de 2 mil por segundo (ex.: dia 5, Black Friday)" },
        { pergunta: "Tempo de resposta?", resposta: "Confirmação em menos de 2 segundos" },
        { pergunta: "Transferência para outro banco?", resposta: "Sim, via um sistema central externo (simular como uma API de terceiros)" },
        { pergunta: "Pode cobrar duas vezes se o app reenviar?", resposta: "Nunca. Cada transferência acontece exatamente uma vez." },
        { pergunta: "Antifraude?", resposta: "Sim, uma checagem antes de aprovar (pode ser um serviço externo)" },
        { pergunta: "Disponibilidade?", resposta: "24/7, inclusive feriados" },
        { pergunta: "Extrato?", resposta: "Sim, consistente com o saldo" },
        { pergunta: "Auditoria?", resposta: "Todo movimento precisa ficar registrado e não pode ser apagado" },
      ],
      sinaisEsperados: [
        "Chave de idempotência em cada transferência",
        "Livro-razão (ledger) imutável, com lançamento de débito e crédito",
        "Transação ou saga para debitar e creditar com segurança",
        "Fila para a comunicação com o sistema externo, com novas tentativas",
        "Antifraude no caminho antes de aprovar",
        "Reconciliação com o sistema externo",
        "Banco relacional com consistência forte para o saldo",
      ],
      armadilhas: [
        "Atualizar o saldo direto sem registro (UPDATE saldo = saldo - x)",
        "Sem idempotência, com risco de cobrança duplicada no reenvio",
        "Chamada síncrona ao sistema externo sem timeout nem nova tentativa",
        "Consistência eventual no saldo",
      ],
      perguntasSugeridas: [
        "Se o app do cliente reenviar a mesma requisição, o que acontece?",
        "E se o sistema externo não responder?",
        "Como você prova para a auditoria o que aconteceu com uma transferência?",
        "Débito feito e crédito falhou: e agora?",
      ],
    },
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
