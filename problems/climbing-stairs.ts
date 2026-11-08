import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

export const CLIMBING_STAIRS: Problem = {
  public: publicFromIde("climbing-stairs"),
  private: {
    // Mudança que o Totti pode trazer no meio da entrevista (ver lib/problems/types.ts).
    empecilhos: [
      {
        id: "escada-zero",
        kind: "caso_novo",
        concept: "caso_base",
        title: "Escada sem degraus",
        statement: "Agora `n` pode ser `0`: a pessoa já está no topo, então existe `1` forma. Se `n` for negativo (erro de cadastro), retorne `0`.",
        announcement:
          "Mudança que chegou do time: o cadastro às vezes manda escada com zero degraus, e aí a pessoa já está no topo, então é 1 forma. E se vier um número negativo, que é erro de cadastro, retorna 0.",
        tests: [
          { name: "Zero degraus", input: { n: 0 }, expected: 1 },
          { name: "Cadastro negativo", input: { n: -3 }, expected: 0 },
        ],
        clarifications: [
          { question: "n pode passar de 45?", answer: "Não, o limite de cima continua 45." },
          { question: "Por que zero degraus é 1 forma?", answer: "Porque não fazer nenhum passo já é um jeito de estar no topo." },
        ],
        rubricNote:
          "Boa adaptação: ajusta os casos base sem quebrar a recorrência e explica por que f(0) = 1 é coerente com f(2) = f(1) + f(0). Fraca: trata como exceção solta sem entender a relação.",
      },
    ],
    hiddenTests: [
      { name: "n = 4", input: { n: 4 }, expected: 5 },
      { name: "n = 10", input: { n: 10 }, expected: 89 },
      { name: "n = 20", input: { n: 20 }, expected: 10946 },
      { name: "n = 30", input: { n: 30 }, expected: 1346269 },
      { name: "Caso grande (n = 44)", input: { n: 44 }, expected: 1134903170, large: true },
    ],
    approaches: [
      { name: "Recursão simples", time: "O(2ⁿ)", space: "O(n)", description: "f(n) = f(n-1) + f(n-2) sem guardar resultados: recalcula os mesmos subproblemas." },
      { name: "Recursão com memoização", time: "O(n)", space: "O(n)", description: "A mesma recorrência guardando o resultado de cada n." },
      { name: "Programação dinâmica iterativa", time: "O(n)", space: "O(1)", description: "Mantém só os dois últimos valores e avança de 1 até n." },
    ],
    commonMistakes: [
      "Recursão sem memoização, estourando o tempo para n grande.",
      "Casos base errados (f(1) = 1 e f(2) = 2).",
      "Erro de uma posição (off-by-one) no loop iterativo.",
      "Usar um array de tamanho n sem prever n = 1.",
    ],
    hints: [
      "Para chegar ao degrau n, de quais degraus você pode ter vindo?",
      "Você está recalculando o mesmo valor várias vezes? Dá pra evitar?",
    ],
    clarifications: [
      { question: "Posso subir mais de 2 degraus?", answer: "Não, só 1 ou 2 por passo." },
      { question: "A ordem dos passos importa?", answer: "Importa: 1+2 e 2+1 são formas diferentes." },
      { question: "Qual o maior n?", answer: "Até 45." },
    ],
    rubricNotes: {
      abordagem: "Bom: chega na recorrência f(n) = f(n-1) + f(n-2) e explica de onde ela vem.",
      complexidade: "Bom: contrasta O(2ⁿ) da recursão ingênua com O(n) da versão com memória.",
      corretude: "Bom: passa nos escondidos, incluindo n = 44 dentro do tempo.",
      bordas: "Bom: trata sozinho n = 1 e n = 2 sem acesso fora do array.",
      comunicacao: "Bom: explica por que a recursão simples fica lenta e como resolveu.",
    },
  },
};
