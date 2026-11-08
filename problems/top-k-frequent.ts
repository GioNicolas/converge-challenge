import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

const grande = [
  ...Array(50_000).fill(7),
  ...Array(30_000).fill(3),
  ...Array.from({ length: 10_000 }, (_, i) => -10_000 + i),
  ...Array.from({ length: 10_000 }, (_, i) => 10 + i),
];

export const TOP_K_FREQUENT: Problem = {
  public: publicFromIde("top-k-frequent"),
  private: {
    // Mudança que o Totti pode trazer no meio da entrevista (ver lib/problems/types.ts).
    empecilhos: [
      {
        id: "k-maior-que-distintos",
        kind: "caso_novo",
        concept: "parametro_fora_do_limite",
        title: "k pode passar do número de valores",
        statement: "Agora `k` pode ser maior que a quantidade de valores distintos de `nums`. Nesse caso, retorne todos os valores distintos.",
        announcement:
          "Uma mudança que veio do time de dados: quem chama essa função às vezes pede um k maior do que a quantidade de valores diferentes que existem. Nesse caso, ela deve retornar todos os valores distintos, sem quebrar.",
        tests: [
          { name: "k maior que os distintos", input: { nums: [1, 1, 2], k: 5 }, expected: [1, 2] },
          { name: "Um valor, k = 2", input: { nums: [3], k: 2 }, expected: [3] },
          { name: "k passa por um", input: { nums: [4, 4, 6, 6, 6, 7], k: 4 }, expected: [4, 6, 7] },
        ],
        clarifications: [
          { question: "Em que ordem?", answer: "Qualquer ordem, como antes." },
          { question: "k pode ser zero ou negativo?", answer: "Não, k continua sendo pelo menos 1." },
        ],
        rubricNote:
          "Boa adaptação: identifica onde o código assume k <= distintos (índice, laço até completar k) e limita sem reescrever tudo. Fraca: estoura índice, entra em laço infinito ou devolve repetidos.",
      },
    ],
    hiddenTests: [
      { name: "k igual ao total de distintos", input: { nums: [1, 2, 3, 3, 2, 3], k: 3 }, expected: [1, 2, 3] },
      { name: "Negativos", input: { nums: [-5, -5, -5, 0, 0, 9], k: 1 }, expected: [-5] },
      { name: "Frequências bem separadas", input: { nums: [8, 8, 8, 8, 2, 2, 2, 5, 5, 1], k: 3 }, expected: [8, 2, 5] },
      { name: "Um valor só", input: { nums: [4, 4, 4], k: 1 }, expected: [4] },
      { name: "Caso grande (10⁵ elementos)", input: { nums: grande, k: 2 }, expected: [7, 3], large: true },
    ],
    approaches: [
      { name: "Contar e ordenar por frequência", time: "O(n log n)", space: "O(n)", description: "Conta com dicionário e ordena os valores distintos pela contagem." },
      { name: "Contar + heap de tamanho k", time: "O(n log k)", space: "O(n)", description: "Conta e mantém um min-heap com os k mais frequentes." },
      { name: "Bucket sort por frequência", time: "O(n)", space: "O(n)", description: "Conta e agrupa valores em baldes indexados pela frequência; lê dos baldes mais altos." },
    ],
    commonMistakes: [
      "Ordenar por valor em vez de por frequência.",
      "Devolver as frequências em vez dos valores.",
      "Heap que mantém os k menores em vez dos k maiores (comparação invertida).",
      "Percorrer o array várias vezes contando um valor de cada vez (O(n²)).",
    ],
    hints: [
      "Antes de escolher os mais frequentes, que informação sobre cada valor você precisa ter calculada?",
      "Depois de contar, como escolher só os k maiores sem ordenar tudo?",
    ],
    clarifications: [
      { question: "E se houver empate na frequência?", answer: "O enunciado garante que a resposta é única." },
      { question: "A ordem do resultado importa?", answer: "Não, qualquer ordem." },
      { question: "O k pode ser maior que o número de valores distintos?", answer: "Não." },
    ],
    rubricNotes: {
      abordagem: "Bom: separa contar de escolher e justifica a estrutura da segunda etapa.",
      complexidade: "Bom: compara O(n log n), O(n log k) e O(n) e sabe o custo de memória da contagem.",
      corretude: "Bom: passa nos escondidos, incluindo negativos e o caso grande.",
      bordas: "Bom: trata sozinho k igual ao total de distintos e valor único.",
      comunicacao: "Bom: explica o trade-off entre ordenar, heap e baldes.",
    },
  },
};
