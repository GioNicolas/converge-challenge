import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

export const MAXIMUM_SUBARRAY: Problem = {
  public: publicFromIde("maximum-subarray"),
  private: {
    // Mudança que o Totti pode trazer no meio da entrevista (ver lib/problems/types.ts).
    empecilhos: [
      {
        id: "lista-vazia",
        kind: "caso_novo",
        concept: "entrada_vazia",
        title: "A lista pode vir vazia",
        statement: "Agora `nums` pode vir vazio (dia sem nenhum valor). Nesse caso, retorne `0`.",
        announcement:
          "Uma mudança: essa função vai rodar num relatório diário, e tem dia que não tem nenhum valor. Então agora a lista pode vir vazia, e aí a resposta é 0. O resto continua igual.",
        tests: [{ name: "Lista vazia", input: { nums: [] }, expected: 0 }],
        clarifications: [
          { question: "Com todos negativos muda alguma coisa?", answer: "Não: continua sendo o maior subarray com pelo menos um elemento." },
          { question: "Os testes antigos mudam?", answer: "Não, todos continuam valendo." },
        ],
        rubricNote:
          "Boa adaptação: vê que a inicialização com o primeiro elemento quebra na lista vazia e trata a borda sem mudar a resposta dos casos negativos. Fraca: troca a inicialização por 0 e passa a errar quando todos são negativos.",
      },
    ],
    hiddenTests: [
      { name: "Todos negativos", input: { nums: [-8, -3, -6, -2, -5] }, expected: -2 },
      { name: "Soma recomeça no meio", input: { nums: [4, -10, 3, 3, -1] }, expected: 6 },
      { name: "Array inteiro", input: { nums: [2, 3, 4] }, expected: 9 },
      { name: "Zeros e negativo", input: { nums: [0, -1, 0] }, expected: 0 },
      { name: "Caso grande (10⁵ elementos)", input: { nums: Array(100_000).fill(1) }, expected: 100_000, large: true },
    ],
    approaches: [
      { name: "Força bruta", time: "O(n²)", space: "O(1)", description: "Testa todos os pares (início, fim) mantendo a soma corrente." },
      { name: "Kadane", time: "O(n)", space: "O(1)", description: "Mantém a melhor soma terminando na posição atual: continua o anterior ou recomeça se ele for negativo." },
      { name: "Divisão e conquista", time: "O(n log n)", space: "O(log n)", description: "Melhor soma à esquerda, à direita ou cruzando o meio." },
    ],
    commonMistakes: [
      "Inicializar o máximo em 0, errando quando todos os números são negativos.",
      "Zerar a soma corrente cedo demais ou tarde demais.",
      "Retornar o subarray em vez da soma.",
      "Não permitir subarray de um único elemento negativo.",
    ],
    hints: [
      "Em cada posição, vale a pena continuar a soma anterior ou começar de novo aqui? Do que depende?",
      "Dá pra decidir isso olhando só o valor acumulado até agora, sem rever o passado?",
    ],
    clarifications: [
      { question: "O subarray pode ser vazio?", answer: "Não, precisa ter pelo menos um elemento." },
      { question: "Todos os números podem ser negativos?", answer: "Podem, e a resposta é o maior deles." },
      { question: "Preciso devolver os índices?", answer: "Não, só a soma." },
    ],
    rubricNotes: {
      abordagem: "Bom: define o que significa a melhor soma terminando em cada posição.",
      complexidade: "Bom: contrasta O(n²) com O(n) tempo e O(1) memória.",
      corretude: "Bom: passa nos escondidos, incluindo todos negativos e o caso grande.",
      bordas: "Bom: trata sozinho todos negativos e array de um elemento.",
      comunicacao: "Bom: explica a decisão de continuar ou recomeçar com clareza.",
    },
  },
};
