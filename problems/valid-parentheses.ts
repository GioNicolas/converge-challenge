import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

export const VALID_PARENTHESES: Problem = {
  public: publicFromIde("valid-parentheses"),
  private: {
    hiddenTests: [
      { name: "Só abre", input: { s: "(((" }, expected: false },
      { name: "Só fecha", input: { s: "]]" }, expected: false },
      { name: "Aninhado misto", input: { s: "{[()()]}" }, expected: true },
      { name: "Fecha antes de abrir", input: { s: ")(" }, expected: false },
      { name: "Sobra um abre", input: { s: "()[" }, expected: false },
      { name: "Caso grande (10⁴ chars)", input: { s: "(".repeat(5000) + ")".repeat(5000) }, expected: true, large: true },
    ],
    approaches: [
      { name: "Remover pares adjacentes", time: "O(n²)", space: "O(n)", description: "Remove repetidamente \"()\", \"[]\" e \"{}\" até a string não mudar." },
      { name: "Pilha", time: "O(n)", space: "O(n)", description: "Empilha aberturas; a cada fechamento, confere se o topo é o par correto." },
    ],
    commonMistakes: [
      "Só contar quantos abre e fecha de cada tipo, ignorando a ordem.",
      "Desempilhar de pilha vazia (erro de execução) em um fechamento sobrando.",
      "Esquecer de conferir se a pilha ficou vazia no fim.",
      "Não diferenciar os tipos de parêntese ao casar.",
    ],
    hints: [
      "Quando aparece um fecha, de qual abertura anterior ele precisa ser par?",
      "Qual estrutura te dá sempre acesso à abertura mais recente ainda não fechada?",
    ],
    clarifications: [
      { question: "A string pode ter outros caracteres?", answer: "Não, só ( ) [ ] { }." },
      { question: "String vazia é válida?", answer: "A string tem pelo menos um caractere." },
      { question: "A ordem de tipos importa?", answer: "Importa: o que abre por último fecha primeiro." },
    ],
    rubricNotes: {
      abordagem: "Bom: explica que o último a abrir é o primeiro a fechar e escolhe a estrutura por isso.",
      complexidade: "Bom: diz O(n) tempo e O(n) memória no pior caso, sabendo por que.",
      corretude: "Bom: passa nos escondidos, incluindo só abre, só fecha e ordem errada.",
      bordas: "Bom: trata sozinho fecha com pilha vazia e sobra de aberturas no fim.",
      comunicacao: "Bom: pensa em voz alta e justifica a escolha da estrutura.",
    },
  },
};
