import type { Problem } from "@/lib/problems/types";
import { publicFromIde } from "./_ide";

const ciclo = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");

export const LONGEST_SUBSTRING_NO_REPEAT: Problem = {
  public: publicFromIde("longest-substring-no-repeat"),
  private: {
    // Mudança que o Totti pode trazer no meio da entrevista (ver lib/problems/types.ts).
    empecilhos: [
      {
        id: "espacos-nas-pontas",
        kind: "caso_novo",
        concept: "normalizacao_de_entrada",
        title: "Espaços sobrando nas pontas",
        statement: "Agora o texto vem de um formulário e pode ter espaços sobrando no começo e no fim. Esses espaços das pontas não contam: ignore-os antes de medir. Os do meio continuam contando.",
        announcement:
          "Uma mudança: essa função vai receber texto digitado num formulário, e o pessoal sempre deixa espaço sobrando no começo e no fim. Esses espaços das pontas não contam. Os espaços do meio continuam contando normal.",
        tests: [
          { name: "Espaços nas duas pontas", input: { s: "  abc  " }, expected: 3 },
          { name: "Só espaços", input: { s: "   " }, expected: 0 },
          { name: "Espaços só no começo", input: { s: "  xyz" }, expected: 3 },
        ],
        clarifications: [
          { question: "Espaço no meio conta?", answer: "Conta, como antes." },
          { question: "Pode vir tab ou quebra de linha?", answer: "Não, só espaço." },
        ],
        rubricNote:
          "Boa adaptação: limpa as pontas antes da janela e mantém a janela igual. Fraca: remove todos os espaços (inclusive os do meio) ou mexe na lógica da janela sem necessidade.",
      },
    ],
    hiddenTests: [
      { name: "Um caractere", input: { s: "a" }, expected: 1 },
      { name: "Tudo distinto", input: { s: "abcdef" }, expected: 6 },
      { name: "Repetição que volta", input: { s: "tmmzuxt" }, expected: 5 },
      { name: "Com espaço", input: { s: "a b a" }, expected: 3 },
      { name: "Repetido colado", input: { s: "dvdf" }, expected: 3 },
      { name: "Caso grande (5·10⁴ chars)", input: { s: ciclo.repeat(Math.ceil(50_000 / 95)).slice(0, 50_000) }, expected: 95, large: true },
    ],
    approaches: [
      { name: "Força bruta", time: "O(n²) a O(n³)", space: "O(k)", description: "Testa cada substring e confere se há repetição." },
      { name: "Janela deslizante com conjunto", time: "O(n)", space: "O(k)", description: "Expande à direita e, ao repetir, encolhe pela esquerda até remover o duplicado." },
      { name: "Janela com último índice", time: "O(n)", space: "O(k)", description: "Guarda a última posição de cada caractere e pula o início da janela direto para depois dela." },
    ],
    commonMistakes: [
      "Mover o início da janela para trás ao ver um caractere repetido antigo (esquecer o max com o início atual).",
      "Resetar a janela inteira ao achar repetição em vez de apenas avançar o início.",
      "Contar caracteres distintos em vez da substring contígua.",
      "Não tratar a string vazia.",
    ],
    hints: [
      "Quando um caractere se repete, o que precisa mudar na janela que você está olhando?",
      "Dá pra evitar reler caracteres que você já viu, só ajustando as pontas da janela?",
    ],
    clarifications: [
      { question: "Substring precisa ser contígua?", answer: "Sim, é um pedaço seguido da string." },
      { question: "Maiúsculas e minúsculas são diferentes?", answer: "Sim, 'a' e 'A' são caracteres diferentes." },
      { question: "A string pode ser vazia?", answer: "Pode, e a resposta é 0." },
    ],
    rubricNotes: {
      abordagem: "Bom: descreve a janela e o que faz quando aparece um repetido.",
      complexidade: "Bom: diz O(n) tempo porque cada ponta só avança, e a memória do conjunto.",
      corretude: "Bom: passa nos escondidos, incluindo 'tmmzuxt' e 'abba'.",
      bordas: "Bom: trata sozinho string vazia, um caractere e repetição que volta antes da janela.",
      comunicacao: "Bom: explica o invariante da janela com exemplo.",
    },
  },
};
