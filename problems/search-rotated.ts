import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

export const SEARCH_ROTATED: Problem = {
  public: publicFromIde("search-rotated"),
  private: {
    // Mudança que o Totti pode trazer no meio da entrevista (ver lib/problems/types.ts).
    empecilhos: [
      {
        id: "repetidos-na-rotacao",
        kind: "caso_novo",
        concept: "valores_repetidos",
        title: "Valores repetidos",
        statement: "Agora `nums` pode ter valores repetidos. O `target`, quando existe, aparece uma vez só. Retorne o índice dele ou `-1`.",
        announcement:
          "Uma mudança: os dados agora podem ter valores repetidos. O target, quando existe, aparece uma vez só, mas os outros valores podem se repetir. Continua retornando o índice dele ou -1.",
        tests: [
          { name: "Repetidos dos dois lados", input: { nums: [1, 0, 1, 1, 1], target: 0 }, expected: 1 },
          { name: "Pivô entre repetidos", input: { nums: [2, 2, 2, 3, 2], target: 3 }, expected: 3 },
          { name: "Quase tudo igual", input: { nums: [1, 1, 1, 1, 2, 1], target: 2 }, expected: 4 },
          { name: "Ausente com repetidos", input: { nums: [3, 1, 1], target: 2 }, expected: -1 },
        ],
        clarifications: [
          { question: "Ainda precisa ser O(log n)?", answer: "No caso comum, sim. Com muitos repetidos pode piorar, e tudo bem se você explicar quando e por quê." },
          { question: "O target pode repetir?", answer: "Não, aparece no máximo uma vez." },
        ],
        rubricNote:
          "Boa adaptação: percebe que, com nums[lo] == nums[mid], não dá para saber qual metade está ordenada, encolhe a borda nesse caso e explica que o pior caso vira O(n). Fraca: não acha o caso que quebra ou cai para busca linear sem explicar.",
      },
    ],
    hiddenTests: [
      { name: "Sem rotação", input: { nums: [1, 2, 3, 4, 5], target: 4 }, expected: 3 },
      { name: "Alvo no pivô", input: { nums: [6, 7, 1, 2, 3, 4, 5], target: 1 }, expected: 2 },
      { name: "Alvo no começo", input: { nums: [6, 7, 1, 2, 3, 4, 5], target: 6 }, expected: 0 },
      { name: "Alvo no fim", input: { nums: [6, 7, 1, 2, 3, 4, 5], target: 5 }, expected: 6 },
      { name: "Dois elementos", input: { nums: [3, 1], target: 3 }, expected: 0 },
      { name: "Ausente", input: { nums: [4, 5, 6, 7, 0, 1, 2], target: 8 }, expected: -1 },
    ],
    approaches: [
      { name: "Busca linear", time: "O(n)", space: "O(1)", description: "Percorre o array. Correta, mas não atende o O(log n) pedido." },
      { name: "Achar o pivô e fazer busca binária", time: "O(log n)", space: "O(1)", description: "Duas buscas binárias: uma para o ponto de rotação e outra no lado certo." },
      { name: "Busca binária em uma passada", time: "O(log n)", space: "O(1)", description: "A cada passo, descobre qual metade está ordenada e decide se o alvo cai nela." },
    ],
    commonMistakes: [
      "Comparar só com o meio como numa busca binária comum, ignorando a rotação.",
      "Decidir qual metade está ordenada com comparação errada (< em vez de <=) e falhar com dois elementos.",
      "Limites do intervalo do alvo com < em vez de <= nas pontas da metade ordenada.",
      "Loop infinito por não avançar lo ou hi.",
    ],
    hints: [
      "Em qualquer ponto do meio, pelo menos uma das duas metades continua ordenada. Como você descobre qual?",
      "Sabendo qual metade está ordenada, como decidir se o alvo está nela?",
    ],
    clarifications: [
      { question: "Pode ter valores repetidos?", answer: "Não, são distintos." },
      { question: "O array pode não estar rotacionado?", answer: "Pode, é uma rotação de 0 posições." },
      { question: "Precisa ser O(log n) mesmo?", answer: "Sim, esse é o requisito." },
    ],
    rubricNotes: {
      abordagem: "Bom: identifica a metade ordenada a cada passo e explica a decisão.",
      complexidade: "Bom: justifica O(log n) e contrasta com a busca linear.",
      corretude: "Bom: passa nos escondidos, incluindo pivô, extremos e dois elementos.",
      bordas: "Bom: trata sozinho array sem rotação, um ou dois elementos e alvo ausente.",
      comunicacao: "Bom: explica as comparações com exemplo concreto.",
    },
  },
};
