import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

export const BINARY_SEARCH: Problem = {
  public: publicFromIde("binary-search"),
  private: {
    hiddenTests: [
      { name: "Menor que todos", input: { nums: [2, 4, 6, 8], target: 1 }, expected: -1 },
      { name: "Maior que todos", input: { nums: [2, 4, 6, 8], target: 9 }, expected: -1 },
      { name: "Dois elementos, o segundo", input: { nums: [1, 3], target: 3 }, expected: 1 },
      { name: "Meio exato", input: { nums: [1, 2, 3, 4, 5], target: 3 }, expected: 2 },
      { name: "Um elemento ausente", input: { nums: [7], target: 3 }, expected: -1 },
      { name: "Array grande", input: { nums: Array.from({ length: 10_000 }, (_, i) => i * 2 - 9_999), target: 9_999 }, expected: 9_999 },
    ],
    approaches: [
      { name: "Busca linear", time: "O(n)", space: "O(1)", description: "Percorre o array até achar. Funciona, mas ignora que está ordenado." },
      { name: "Busca binária", time: "O(log n)", space: "O(1)", description: "Mantém um intervalo [lo, hi] e descarta metade a cada passo comparando com o meio." },
    ],
    commonMistakes: [
      "Loop infinito por atualizar lo ou hi sem somar ou subtrair 1.",
      "Condição do loop errada (lo < hi em vez de lo <= hi), perdendo o último elemento.",
      "Calcular o meio com overflow em C/C++ (lo + hi) em vez de lo + (hi - lo) / 2.",
      "Não tratar array de um elemento ou alvo fora do intervalo.",
    ],
    hints: [
      "Comparando o alvo com o elemento do meio, o que você consegue descartar?",
      "Que informação o fato de o array estar ordenado te dá que uma busca comum não usa?",
    ],
    clarifications: [
      { question: "Pode ter valores repetidos?", answer: "Não, os valores são distintos." },
      { question: "O array está ordenado?", answer: "Sim, em ordem crescente." },
      { question: "O que retornar se não achar?", answer: "-1." },
    ],
    rubricNotes: {
      abordagem: "Bom: explica o invariante do intervalo e por que descartar metade é seguro.",
      complexidade: "Bom: diz O(log n) tempo e O(1) memória e contrasta com a busca linear.",
      corretude: "Bom: passa nos escondidos, incluindo extremos e um elemento.",
      bordas: "Bom: trata sozinho alvo fora do intervalo, array de um elemento e o fim do loop.",
      comunicacao: "Bom: justifica a condição do loop e as atualizações dos limites.",
    },
  },
};
