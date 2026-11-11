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
  ],
  problemas: [
    {
      id: "encurtador_url",
      titulo: "Encurtador de URL",
      enunciado:
        "Projete um serviço como o bit.ly: recebe uma URL longa e devolve uma curta. Quem acessa a curta é redirecionado. No quadro, mostre a arquitetura de ponta a ponta: as peças do sistema (clientes, serviços, bancos de dados, filas), como elas se ligam e o caminho de um link, da criação até o redirecionamento. Não precisa desenhar telas.",
      falaDoDesafio:
        "Hoje a conversa é sobre um encurtador de links, tipo o bit.ly: a pessoa cola um endereço comprido, recebe um curtinho, e quem abrir o curto é levado ao original. O que eu quero ver no quadro é a arquitetura por trás disso: as peças do sistema, como elas se ligam e o caminho que um link faz de ponta a ponta. Não precisa desenhar as telas. O problema é aberto de propósito, então pergunte o que quiser antes de desenhar. E vá pensando em voz alta, que o que me interessa é entender como você pensa.",
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
      empecilho: {
        id: "encurtador_volume_10x",
        tipo: "requisito_muda",
        fala:
          "Uma mudança no problema: a empresa fechou com um parceiro grande e o volume de links novos cresceu dez vezes, então agora são um bilhão por mês, e os acessos cresceram na mesma proporção. Olhando o que você já desenhou, onde isso pega primeiro?",
        requisito: "Mudança: volume 10x (1 bilhão de URLs/mês)",
        exige:
          "Rever gargalos com 10x mais escrita e leitura: geração de código sem colisão em escala, particionamento ou réplicas do banco, cache e o espaço do código curto (7 caracteres ainda bastam?).",
      },
    },
    {
      id: "chat_tempo_real",
      titulo: "Chat de mensagens em tempo real",
      enunciado:
        "Projete um app de mensagens usado por milhões de pessoas: conversas um a um e em grupo, com a mensagem chegando na hora. No quadro, mostre a arquitetura de ponta a ponta: as peças do sistema (clientes, serviços, bancos de dados, filas), como elas se ligam e o caminho de uma mensagem, de quem envia até quem recebe (online ou não). Não precisa desenhar telas.",
      falaDoDesafio:
        "Hoje o tema é um aplicativo de mensagens, desses com conversa entre duas pessoas e em grupo, em que a mensagem chega na hora, para milhões de pessoas. O que eu quero ver no quadro é a arquitetura por trás disso: as peças do sistema, como elas se ligam e o caminho que uma mensagem faz de ponta a ponta. Não precisa desenhar as telas. Os números eu deixei de fora de propósito, então pergunte o que precisar antes de desenhar. Vá contando o que pensa enquanto desenha, que é isso que eu quero acompanhar.",
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
      empecilho: {
        id: "chat_grupos_grandes",
        tipo: "requisito_muda",
        fala:
          "Uma mudança no problema: o produto decidiu liberar grupos de até cem mil pessoas, tipo canais de comunidade, e eles devem continuar recebendo as mensagens na hora. Pensando no caminho de uma mensagem que você desenhou, o que muda com um grupo desse tamanho?",
        requisito: "Mudança: grupos de até 100 mil pessoas",
        exige:
          "Rever o fan-out: entregar uma mensagem para 100 mil membros sem travar quem envia (fila e fan-out assíncrono, ou leitura sob demanda para grupos grandes), push em massa e o custo de guardar uma cópia por membro.",
      },
    },
    {
      id: "pagamentos_instantaneos",
      titulo: "Pagamentos instantâneos",
      enunciado:
        "Projete o sistema de transferências instantâneas de um banco digital: o cliente envia dinheiro para outra conta e o recebedor vê na hora. No quadro, mostre a arquitetura de ponta a ponta: as peças do sistema (clientes, serviços, bancos de dados, filas), como elas se ligam e o caminho de uma transferência, do pedido até o dinheiro na outra conta. Não precisa desenhar telas.",
      falaDoDesafio:
        "Hoje vamos falar de transferências instantâneas num banco digital: o cliente manda dinheiro pra outra conta e quem recebe vê o valor na hora. O que eu quero ver no quadro é a arquitetura por trás disso: as peças do sistema, como elas se ligam e o caminho que uma transferência faz de ponta a ponta. Não precisa desenhar as telas. Tem muita coisa que não foi dita, então pergunte à vontade antes de começar a desenhar. E pense em voz alta, que o caminho que você escolhe me importa mais que o desenho final.",
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
      empecilho: {
        id: "pagamentos_externo_fora",
        tipo: "parte_cai",
        fala:
          "Uma mudança no problema: o sistema central dos outros bancos passou a ficar fora do ar por até dez minutos algumas vezes por dia, sem aviso, e o cliente não pode ser cobrado duas vezes nem perder dinheiro. No fluxo que você desenhou, o que acontece com uma transferência para outro banco nesse intervalo?",
        requisito: "Mudança: sistema externo cai até 10 min",
        exige:
          "Tratar a indisponibilidade do sistema externo: fila com nova tentativa e idempotência, estado pendente visível para o cliente, timeout, estorno ou compensação se não concluir e reconciliação depois.",
      },
    },
  ],
};
