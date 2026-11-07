import type { Problem } from "@/lib/problems/types";
import { problems as IDE_PROBLEMS } from "@/lib/problems";

export const TWO_SUM: Problem = {
  public: {
    id: "two-sum",
    title: "Two Sum",
    statement:
      "Dado um array de inteiros `nums` e um inteiro `target`, retorne os índices dos dois números cuja soma seja igual a `target`. " +
      "Cada entrada tem exatamente uma solução, e você não pode usar o mesmo elemento duas vezes. A resposta pode vir em qualquer ordem.",
    examples: [
      { input: "nums = [2, 7, 11, 15], target = 9", output: "[0, 1]", explanation: "nums[0] + nums[1] == 9" },
      { input: "nums = [3, 2, 4], target = 6", output: "[1, 2]" },
    ],
    constraints: [
      "2 <= nums.length <= 10^4",
      "-10^9 <= nums[i] <= 10^9",
      "-10^9 <= target <= 10^9",
      "Existe exatamente uma resposta válida.",
    ],
    // Os mesmos starters que a IDE mostra: a política compara o código com eles.
    starters: IDE_PROBLEMS["two-sum"].starters,
    visibleTests: [
      { input: { nums: [2, 7, 11, 15], target: 9 }, expected: [0, 1] },
      { input: { nums: [3, 2, 4], target: 6 }, expected: [1, 2] },
      { input: { nums: [3, 3], target: 6 }, expected: [0, 1] },
    ],
  },
  private: {
    hiddenTests: [
      { input: { nums: [-3, 4, 3, 90], target: 0 }, expected: [0, 2] },
      { input: { nums: [0, 4, 3, 0], target: 0 }, expected: [0, 3] },
      { input: { nums: [1, 5, 1, 5], target: 10 }, expected: [1, 3] },
      { input: { nums: [5, 75, 25], target: 100 }, expected: [1, 2] },
      // Caso grande: 10^5 elementos, par no fim. Força bruta estoura o tempo.
      { input: { generator: "range", size: 100000, pair: [99998, 99999] }, expected: [99998, 99999] },
    ],
    approaches: [
      {
        name: "Força bruta",
        time: "O(n²)",
        space: "O(1)",
        description: "Dois loops aninhados testando todos os pares. O loop interno deve começar em i + 1.",
      },
      {
        name: "Ordenar + dois ponteiros",
        time: "O(n log n)",
        space: "O(n)",
        description: "Ordena guardando os índices originais e aproxima dois ponteiros das pontas.",
      },
      {
        name: "Hashmap em uma passada",
        time: "O(n)",
        space: "O(n)",
        description: "Para cada número, procura target - número num dicionário de vistos; senão, guarda número → índice.",
      },
    ],
    commonMistakes: [
      "Loop interno começando em 0, somando o elemento com ele mesmo.",
      "Guardar no dicionário antes de procurar o complemento, pegando o próprio elemento.",
      "Não tratar o caso sem par (retorno implícito / indefinido).",
      "Ordenar o array e devolver os índices da versão ordenada.",
      "Em C++, receber o vetor por valor ou não retornar em todos os caminhos.",
    ],
    hints: [
      "Pra cada número que você olha, você sabe exatamente qual outro número precisaria encontrar. Isso ajuda em alguma coisa?",
      "Tem alguma estrutura de dados que te deixa checar se um número já apareceu sem percorrer a lista toda?",
    ],
    clarifications: [
      { question: "Pode ter números negativos ou zero?", answer: "Pode, tanto em nums quanto no target." },
      { question: "Pode ter números repetidos?", answer: "Pode. Só não vale usar a mesma posição duas vezes." },
      { question: "O array vem ordenado?", answer: "Não, a ordem é qualquer uma." },
      { question: "A ordem dos índices na resposta importa?", answer: "Não, [0, 1] e [1, 0] valem igual." },
      { question: "E se não existir par?", answer: "O enunciado garante que sempre existe exatamente uma resposta." },
      { question: "Qual o tamanho máximo do array?", answer: "Até 10 mil elementos." },
      { question: "Posso usar bibliotecas?", answer: "Pode usar a biblioteca padrão da linguagem." },
    ],
    rubricNotes: {
      abordagem: "Bom: explica o plano antes de codar, sabe por que escolheu força bruta ou hashmap.",
      complexidade: "Bom: diz O(n²) vs O(n) e o custo de memória do dicionário sem ser provocado demais.",
      corretude: "Bom: passa nos testes escondidos, incluindo números repetidos e o caso grande.",
      bordas: "Bom: trata sozinho repetidos, negativos, zero e ausência de par.",
      comunicacao: "Bom: pensa em voz alta, responde com profundidade, aplica rápido a dica que pediu.",
    },
  },
};
