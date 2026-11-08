// Relatório de exemplo (só em desenvolvimento, em /relatorio/exemplo): para revisar o visual e tirar
// imagens para o pitch sem precisar rodar uma entrevista inteira. Dados inventados.
import type { RelatorioVisto } from "./relatorio";

export const RELATORIO_EXEMPLO: RelatorioVisto = {
  sessaoId: "exemplo",
  candidatoId: "Marina Duarte",
  area: "system design",
  problema: "Encurtador de URL",
  realizadaEm: "7 de novembro, 15:02",
  duracao: "34 min",
  perguntas: 4,
  notaGeral: 2.8,
  recomendacao: "avancar_com_ressalvas",
  criterios: [
    {
      id: "requisitos",
      nome: "Levantamento de requisitos",
      nota: 4,
      significado: "Pergunta escala, latência e retenção antes de desenhar e usa as respostas nas escolhas.",
      justificativa:
        "Antes de desenhar, perguntou a escala de leitura e por quanto tempo os links ficam guardados. Usou a proporção de 100 leituras por escrita para justificar o cache mais tarde.",
      provas: [
        { tipo: "fala", momento: "01:12", texto: "Antes de desenhar: quantos acessos por segundo a gente espera, e é mais leitura ou escrita?" },
        { tipo: "fala", momento: "01:40", texto: "Os links expiram ou ficam para sempre?" },
      ],
    },
    {
      id: "componentes_fluxo",
      nome: "Componentes e fluxo",
      nota: 3,
      significado: "Os componentes principais estão lá e o fluxo de ponta a ponta faz sentido.",
      justificativa:
        "Desenhou cliente, API, gerador de códigos e banco, com o caminho do redirecionamento separado do de criação. Faltou explicar o que acontece quando o código não existe.",
      provas: [{ tipo: "desenho", momento: "06:30", elementos: ["Cliente", "API", "Gerador de código", "Postgres"], imagem: null, observacao: "leitura e criação em caminhos separados" }],
    },
    {
      id: "escalabilidade",
      nome: "Escalabilidade",
      nota: 2,
      significado: "Reconhece o gargalo quando provocado, mas a solução fica vaga.",
      justificativa:
        "O banco único só foi questionado depois da pergunta do entrevistador. A resposta trouxe um cache, sem dizer o que vai nele nem como é invalidado.",
      aprendidoComOTime: [{ texto: "Penaliza quem escolhe o banco sem estimar o volume de escrita", efeito: "penaliza" }],
      provas: [
        { tipo: "desenho", momento: "12:05", elementos: ["Postgres"], imagem: null, observacao: "banco único, sem cache, recebendo toda a leitura" },
        { tipo: "fala", momento: "13:20", texto: "Dá para colocar um Redis na frente... guardando os mais acessados." },
      ],
    },
    {
      id: "dados_consistencia",
      nome: "Dados e consistência",
      nota: 3,
      significado: "Escolhe o modelo de dados com justificativa e trata colisão.",
      justificativa: "Explicou a geração de códigos em base62 a partir de um contador, o que evita colisão sem consultar o banco.",
      provas: [{ tipo: "fala", momento: "09:48", texto: "uso um contador e converto para base62, aí nunca repete" }],
    },
    {
      id: "tradeoffs",
      nome: "Trade-offs",
      nota: null,
      significado: null,
      justificativa: "Sem evidência suficiente para atribuir nota a este critério.",
      provas: [],
    },
    {
      id: "comunicacao",
      nome: "Comunicação",
      nota: 3,
      significado: "Explica o raciocínio enquanto desenha e responde de forma direta.",
      justificativa: "Narrou as decisões enquanto desenhava e respondeu às perguntas sem rodeios.",
      provas: [{ tipo: "fala", momento: "05:10", texto: "vou separar a leitura da escrita porque o volume é muito diferente" }],
    },
  ],
  pontosFortes: [
    "Levantou requisitos antes de desenhar, sem ser provocada.",
    "Geração de código sem colisão, bem justificada.",
  ],
  pontosAAprofundar: [
    "Estratégia de cache: o que entra, por quanto tempo e como invalida.",
    "Trade-offs não apareceram: vale perguntar consistência × disponibilidade.",
  ],
  briefing:
    "Boa base e ótimo levantamento de requisitos. Na próxima conversa, aprofunde cache e trade-offs de consistência: foi onde ela precisou de ajuda.",
  desenhoFinal: null,
  provasConferidas: 7,
  ajustes: ["evidência de fala descartada em tradeoffs: citação não encontrada", "nota de tradeoffs removida: sem evidência"],
  demonstracao: true,
};
