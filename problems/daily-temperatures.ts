import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

const grandeTemps = [...Array(99_999).fill(30), 31];
const grandeResp = [...Array.from({ length: 99_999 }, (_, i) => 99_999 - i), 0];

export const DAILY_TEMPERATURES: Problem = {
  public: publicFromIde("daily-temperatures"),
  private: {
    hiddenTests: [
      { name: "Temperaturas iguais", input: { temperatures: [70, 70, 70] }, expected: [0, 0, 0] },
      { name: "Vale no meio", input: { temperatures: [80, 60, 70, 90] }, expected: [3, 1, 1, 0] },
      { name: "Dois dias", input: { temperatures: [60, 61] }, expected: [1, 0] },
      { name: "Picos alternados", input: { temperatures: [50, 70, 50, 70, 90] }, expected: [1, 3, 1, 1, 0] },
      { name: "Caso grande (10⁵ dias)", input: { temperatures: grandeTemps }, expected: grandeResp, large: true },
    ],
    approaches: [
      { name: "Força bruta", time: "O(n²)", space: "O(1)", description: "Para cada dia, varre os seguintes até achar um mais quente." },
      { name: "Pilha monotônica de índices", time: "O(n)", space: "O(n)", description: "Guarda índices de dias ainda sem resposta; um dia mais quente resolve todos os do topo mais frios." },
    ],
    commonMistakes: [
      "Guardar temperaturas em vez de índices na pilha, perdendo a distância.",
      "Usar >= em vez de > na comparação (temperatura igual não conta).",
      "Esquecer que os dias que sobram na pilha ficam com 0.",
      "Percorrer de trás pra frente sem tratar o último dia.",
    ],
    hints: [
      "Quando chega um dia mais quente, quais dias anteriores ele acaba de 'resolver'?",
      "Que estrutura te deixa guardar os dias ainda sem resposta e olhar sempre o mais recente?",
    ],
    clarifications: [
      { question: "Temperatura igual conta como mais quente?", answer: "Não, tem que ser estritamente maior." },
      { question: "O que retornar se nunca esquentar?", answer: "0 naquela posição." },
      { question: "O tamanho da resposta é o do array?", answer: "Sim, um valor por dia." },
    ],
    rubricNotes: {
      abordagem: "Bom: explica o que fica guardado e quando um dia é resolvido.",
      complexidade: "Bom: diz que cada dia entra e sai da pilha uma vez, logo O(n), e a memória O(n).",
      corretude: "Bom: passa nos escondidos, incluindo iguais e o caso grande.",
      bordas: "Bom: trata sozinho temperaturas iguais, dias sem resposta e array de um dia.",
      comunicacao: "Bom: justifica por que guarda índices e não valores.",
    },
  },
};
