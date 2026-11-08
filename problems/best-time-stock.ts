import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

export const BEST_TIME_STOCK: Problem = {
  public: publicFromIde("best-time-stock"),
  private: {
    // Mudança que o Totti pode trazer no meio da entrevista (ver lib/problems/types.ts).
    empecilhos: [
      {
        id: "dia-sem-cotacao",
        kind: "caso_novo",
        concept: "dado_invalido",
        title: "Dias sem cotação",
        statement: "Agora alguns dias vêm sem cotação, marcados com `-1`. Esses dias não podem ser usados nem para comprar nem para vender.",
        announcement:
          "Mudança que chegou agora: a fonte dos preços às vezes falha, e o dia vem marcado com -1. Esses dias não podem ser usados nem pra comprar nem pra vender. O resto continua igual.",
        tests: [
          { name: "Dias sem cotação no meio", input: { prices: [7, -1, 1, 5, -1, 6] }, expected: 5 },
          { name: "Só dias sem cotação", input: { prices: [-1, -1] }, expected: 0 },
          { name: "Falha antes de cair", input: { prices: [3, -1, 1] }, expected: 0 },
        ],
        hiddenTests: [{ name: "Falhas espalhadas", input: { prices: [-1, 4, -1, 2, 9] }, expected: 7 }],
        clarifications: [
          { question: "Pode vir só -1?", answer: "Pode. Aí não há lucro: retorne 0." },
          { question: "Pode ter outro valor negativo?", answer: "Não, só o -1 marca o dia sem cotação." },
          { question: "O dia sem cotação conta como um dia que passou?", answer: "Conta, mas não dá para operar nele." },
        ],
        rubricNote:
          "Boa adaptação: percebe que o -1 vira o menor preço e corrompe a compra, e pula esses dias no mesmo passe. Fraca: filtra mal (perde a ordem dos dias) ou não percebe o efeito no mínimo.",
      },
    ],
    hiddenTests: [
      { name: "Só cai", input: { prices: [9, 8, 7, 6] }, expected: 0 },
      { name: "Mínimo depois do máximo", input: { prices: [10, 1, 2, 3, 0, 4] }, expected: 4 },
      { name: "Preços iguais", input: { prices: [3, 3, 3, 3] }, expected: 0 },
      { name: "Lucro no começo", input: { prices: [1, 9, 2, 3] }, expected: 8 },
      { name: "Caso grande (10⁵ dias)", input: { prices: Array.from({ length: 100_000 }, (_, i) => i % 10_001) }, expected: 10_000, large: true },
    ],
    approaches: [
      { name: "Força bruta", time: "O(n²)", space: "O(1)", description: "Testa todos os pares (compra, venda) com venda depois da compra." },
      { name: "Um passe guardando o mínimo", time: "O(n)", space: "O(1)", description: "Percorre uma vez guardando o menor preço visto e o maior lucro se vendesse hoje." },
    ],
    commonMistakes: [
      "Usar o menor e o maior preço do array sem checar a ordem (vender antes de comprar).",
      "Inicializar o lucro em um valor que pode ficar negativo em vez de 0.",
      "Esquecer de atualizar o menor preço visto quando aparece um preço ainda menor.",
      "Não tratar array de um único dia.",
    ],
    hints: [
      "Para cada dia de venda, qual é a informação do passado que você mais precisaria ter à mão?",
      "Dá pra resolver olhando cada preço uma só vez, carregando algum valor adiante?",
    ],
    clarifications: [
      { question: "Posso comprar e vender no mesmo dia?", answer: "Pode, o lucro nesse caso é zero." },
      { question: "Posso fazer mais de uma transação?", answer: "Não, só uma compra e uma venda." },
      { question: "E se os preços só caírem?", answer: "Retorne 0." },
      { question: "O array pode ter só um dia?", answer: "Pode, o lucro é 0." },
    ],
    rubricNotes: {
      abordagem: "Bom: percebe que a venda precisa vir depois da compra e explica o que guarda ao percorrer.",
      complexidade: "Bom: diz O(n²) da força bruta e O(n) tempo, O(1) memória da solução de um passe.",
      corretude: "Bom: passa nos testes escondidos, incluindo só queda e o caso grande.",
      bordas: "Bom: trata sozinho um dia só, preços iguais e queda contínua devolvendo 0.",
      comunicacao: "Bom: explica o raciocínio antes de codar e aplica rápido a dica pedida.",
    },
  },
};
