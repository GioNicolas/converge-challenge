// Fixture: a questão real da issue #90, usada pelo teste da revisão e pelo script de verificação manual.
import type { Problema } from "./tipos";

/** A questão real da issue #90 (vaga cfg-mwcar7wdmdog), reconstruída: título errado, concordância e fala longa. */
export const casoReal = (): Problema => ({
  id: "cfg_mwcar7wdmdog_p1",
  titulo: "Painel de Vendas em Tempo Real",
  enunciado:
    "Desenhe o sistema que mostra, em tempo real, o status das entregas das suas pedidos para os clientes e para a operação de logística do app.",
  falaDoDesafio:
    "Hoje o tema é como um app de logística mostra, para quem fez o pedido e para a operação, o andamento das pedidos deles enquanto o entregador está na rua. " +
    "Antes de desenhar, você pode me perguntar o que precisar sobre o problema, e eu respondo o que souber. " +
    "Vá pensando em voz alta enquanto desenha, que isso me ajuda a acompanhar o seu raciocínio. Pode perguntar o que precisar a qualquer momento.",
  ficha: [
    { pergunta: "Quantos usuários o app tem?", resposta: "Cerca de 400 mil usuários ativos por mês, com pico de 30 mil acessos simultâneos às 12h." },
    { pergunta: "Qual o volume de pedidos?", resposta: "120 mil pedidos por dia, com pico de 8 pedidos por segundo." },
    { pergunta: "Com que frequência o status muda?", resposta: "Cada pedido muda de status em média 6 vezes; o cliente espera ver a mudança em até 5 segundos." },
    { pergunta: "O que o cliente enxerga?", resposta: "Só o status das próprias pedidos, nunca o de outro cliente." },
    { pergunta: "E o entregador sem sinal?", resposta: "O app guarda a posição e envia quando voltar; atraso de até 2 minutos é aceitável." },
    { pergunta: "Por quanto tempo guardar o histórico?", resposta: "90 dias online e 2 anos em arquivo frio." },
    { pergunta: "Há integrações?", resposta: "Sim: 3 transportadoras parceiras enviam o status por webhook, com 99,5% de entrega." },
    { pergunta: "O que está fora do escopo?", resposta: "Roteirização e cobrança ficam fora; só o acompanhamento do status." },
  ],
  sinaisEsperados: ["Pergunta o volume", "Separa leitura de escrita", "Trata entregador sem sinal", "Justifica o tempo real"],
  armadilhas: ["Consultar o banco a cada tela", "Ignorar a ordem dos eventos", "Esquecer a privacidade entre clientes"],
  perguntasSugeridas: ["Por que essa escolha?", "E se uma transportadora cair?", "Como o cliente vê um status atrasado?"],
});

