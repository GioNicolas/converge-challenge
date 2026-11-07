// PARTE PÚBLICA do problema (a IDE mostra). Testes escondidos, soluções e dicas
// ficam só no servidor/agente (Pessoa B) — nunca colocar aqui.
//
// O banco abaixo reúne os clássicos de entrevista (estilo LeetCode) e variações
// deles. Cada problema é descrito por uma assinatura (`native`) a partir da qual
// saem os códigos iniciais de Python/C++/C e os drivers de teste de C/C++.

export type PublicTest = { name: string; args: unknown[]; expected: unknown };

/** Tipos suportados nas assinaturas (Python, C++ e C). */
export type NativeType = "int" | "bool" | "string" | "int[]";

export type NativeSpec = {
  /** Nome da função em C/C++ (camelCase). Em Python usa-se `functionName`. */
  cppName: string;
  params: { name: string; type: NativeType }[];
  returns: NativeType;
};

export type Difficulty = "facil" | "medio";

export type PublicProblem = {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  examples: { input: string; output: string; note?: string }[];
  constraints: string[];
  starterCode: string;
  /** Código inicial por linguagem (python, cpp, c). */
  starters: Record<string, string>;
  functionName: string;
  native: NativeSpec;
  compare: "exact" | "sorted";
  visibleTests: PublicTest[];
};

// ---------------------------------------------------------------------------
// Geração de código inicial e exemplos a partir da assinatura
// ---------------------------------------------------------------------------

const CPP_RET: Record<NativeType, string> = { int: "int", bool: "bool", string: "string", "int[]": "vector<int>" };
const CPP_DEFAULT: Record<NativeType, string> = { int: "0", bool: "false", string: '""', "int[]": "{}" };
const C_RET: Record<NativeType, string> = { int: "int", bool: "bool", string: "char*", "int[]": "int*" };

function cppParams(spec: NativeSpec): string {
  return spec.params
    .map((p) => (p.type === "int[]" ? `vector<int>& ${p.name}` : p.type === "string" ? `string ${p.name}` : `${p.type} ${p.name}`))
    .join(", ");
}

function cParams(spec: NativeSpec): string {
  const list = spec.params.map((p) =>
    p.type === "int[]" ? `int* ${p.name}, int ${p.name}Size` : p.type === "string" ? `char* ${p.name}` : `${p.type} ${p.name}`,
  );
  if (spec.returns === "int[]") list.push("int* returnSize");
  return list.join(", ");
}

function makeStarters(fn: string, spec: NativeSpec): Record<string, string> {
  const python = `def ${fn}(${spec.params.map((p) => p.name).join(", ")}):\n    # escreva sua solução aqui\n    pass\n`;
  const cpp = `#include <vector>\n#include <string>\nusing namespace std;\n\n${CPP_RET[spec.returns]} ${spec.cppName}(${cppParams(spec)}) {\n    // escreva sua solução aqui\n    return ${CPP_DEFAULT[spec.returns]};\n}\n`;
  const hint =
    spec.returns === "int[]"
      ? "// Retorne um array alocado com malloc e defina *returnSize com o tamanho dele.\n"
      : spec.returns === "string"
        ? "// Retorne uma string alocada com malloc (terminada em '\\0').\n"
        : "";
  const body =
    spec.returns === "int[]"
      ? "*returnSize = 0;\n    return NULL;"
      : spec.returns === "string"
        ? "return NULL;"
        : spec.returns === "bool"
          ? "return false;"
          : "return 0;";
  const c = `#include <stdbool.h>\n#include <stdlib.h>\n#include <string.h>\n\n${hint}${C_RET[spec.returns]} ${spec.cppName}(${cParams(spec)}) {\n    // escreva sua solução aqui\n    ${body}\n}\n`;
  return { python, cpp, c };
}

function show(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(show).join(",")}]`;
  if (typeof v === "string") return JSON.stringify(v);
  return String(v);
}

type Def = {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  constraints: string[];
  fn: string; // nome em Python
  cpp: string; // nome em C/C++
  params: [string, NativeType][];
  returns: NativeType;
  compare?: "exact" | "sorted";
  tests: [unknown[], unknown][];
  notes?: string[]; // nota do exemplo i (opcional)
};

function define(d: Def): PublicProblem {
  const native: NativeSpec = {
    cppName: d.cpp,
    params: d.params.map(([name, type]) => ({ name, type })),
    returns: d.returns,
  };
  const starters = makeStarters(d.fn, native);
  return {
    id: d.id,
    title: d.title,
    difficulty: d.difficulty,
    topic: d.topic,
    statement: d.statement,
    examples: d.tests.slice(0, 3).map(([args, expected], i) => ({
      input: d.params.map(([name], k) => `${name} = ${show(args[k])}`).join(", "),
      output: show(expected),
      ...(d.notes?.[i] ? { note: d.notes[i] } : {}),
    })),
    constraints: d.constraints,
    starterCode: starters.python,
    starters,
    functionName: d.fn,
    native,
    compare: d.compare ?? "exact",
    visibleTests: d.tests.map(([args, expected], i) => ({ name: `Exemplo ${i + 1}`, args, expected })),
  };
}

// ---------------------------------------------------------------------------
// Banco de problemas
// ---------------------------------------------------------------------------

const DEFS: Def[] = [
  // ----- Arrays e hash ------------------------------------------------------
  {
    id: "two-sum",
    title: "Two Sum",
    difficulty: "facil",
    topic: "Hash map",
    statement:
      "Dado um array de inteiros `nums` e um inteiro `target`, retorne os índices de dois números que somam `target`. Existe exatamente uma solução e você não pode usar o mesmo elemento duas vezes. A resposta pode vir em qualquer ordem.",
    constraints: ["2 <= len(nums) <= 10⁴", "-10⁹ <= nums[i] <= 10⁹", "Existe exatamente uma resposta válida"],
    fn: "two_sum",
    cpp: "twoSum",
    params: [["nums", "int[]"], ["target", "int"]],
    returns: "int[]",
    compare: "sorted",
    tests: [
      [[[2, 7, 11, 15], 9], [0, 1]],
      [[[3, 2, 4], 6], [1, 2]],
      [[[3, 3], 6], [0, 1]],
      [[[-3, 4, 3, 90], 0], [0, 2]],
      [[[1000000000, -1000000000, 5], 0], [0, 1]],
    ],
    notes: ["2 + 7 = 9"],
  },
  {
    id: "top-k-frequent",
    title: "K elementos mais frequentes",
    difficulty: "medio",
    topic: "Hash map + heap",
    statement:
      "Dado um array `nums` e um inteiro `k`, retorne os `k` valores mais frequentes, em qualquer ordem. A resposta é única. Tente fazer melhor que O(n log n).",
    constraints: ["1 <= len(nums) <= 10⁵", "-10⁴ <= nums[i] <= 10⁴", "1 <= k <= número de valores distintos", "A resposta é única"],
    fn: "top_k_frequent",
    cpp: "topKFrequent",
    params: [["nums", "int[]"], ["k", "int"]],
    returns: "int[]",
    compare: "sorted",
    tests: [
      [[[1, 1, 1, 2, 2, 3], 2], [1, 2]],
      [[[1], 1], [1]],
      [[[4, 4, 4, 5, 5, 6, 6, 6, 6], 2], [4, 6]],
      [[[5, 5, 5, 5], 1], [5]],
      [[[-1, -1, 2, 2, 2, 3], 2], [2, -1]],
    ],
  },

  // ----- Prefixos, janela, pilha -------------------------------------------
  {
    id: "best-time-stock",
    title: "Melhor momento para comprar e vender ações",
    difficulty: "facil",
    topic: "Um passe / greedy",
    statement:
      "`prices[i]` é o preço de uma ação no dia `i`. Escolha **um** dia para comprar e outro, depois dele, para vender. Retorne o lucro máximo, ou `0` se não houver lucro possível.",
    constraints: ["1 <= len(prices) <= 10⁵", "0 <= prices[i] <= 10⁴"],
    fn: "max_profit",
    cpp: "maxProfit",
    params: [["prices", "int[]"]],
    returns: "int",
    tests: [
      [[[7, 1, 5, 3, 6, 4]], 5],
      [[[7, 6, 4, 3, 1]], 0],
      [[[2, 4, 1]], 2],
      [[[5]], 0],
      [[[0, 10000]], 10000],
    ],
    notes: ["Compra a 1, vende a 6"],
  },
  {
    id: "maximum-subarray",
    title: "Subarray de soma máxima",
    difficulty: "medio",
    topic: "Programação dinâmica (Kadane)",
    statement: "Dado um array `nums`, encontre o subarray contíguo (com pelo menos um elemento) de **maior soma** e retorne essa soma.",
    constraints: ["1 <= len(nums) <= 10⁵", "-10⁴ <= nums[i] <= 10⁴"],
    fn: "max_sub_array",
    cpp: "maxSubArray",
    params: [["nums", "int[]"]],
    returns: "int",
    tests: [
      [[[-2, 1, -3, 4, -1, 2, 1, -5, 4]], 6],
      [[[1]], 1],
      [[[5, 4, -1, 7, 8]], 23],
      [[[-3, -1, -2]], -1],
      [[[8, -19, 5, -4, 20]], 21],
    ],
    notes: ["[4,-1,2,1] soma 6"],
  },
  {
    id: "daily-temperatures",
    title: "Temperaturas diárias",
    difficulty: "medio",
    topic: "Pilha monotônica",
    statement:
      "Dado `temperatures`, retorne um array `answer` em que `answer[i]` é quantos dias é preciso esperar depois do dia `i` para encontrar uma temperatura **maior**. Se não houver, `0`.",
    constraints: ["1 <= len(temperatures) <= 10⁵", "30 <= temperatures[i] <= 100"],
    fn: "daily_temperatures",
    cpp: "dailyTemperatures",
    params: [["temperatures", "int[]"]],
    returns: "int[]",
    tests: [
      [[[73, 74, 75, 71, 69, 72, 76, 73]], [1, 1, 4, 2, 1, 1, 0, 0]],
      [[[30, 40, 50, 60]], [1, 1, 1, 0]],
      [[[30, 60, 90]], [1, 1, 0]],
      [[[50]], [0]],
      [[[90, 80, 70]], [0, 0, 0]],
    ],
  },
  {
    id: "valid-parentheses",
    title: "Parênteses válidos",
    difficulty: "facil",
    topic: "Pilha",
    statement:
      "Dada uma string `s` só com `()[]{}`, retorne `true` se ela é válida: todo abre é fechado pelo mesmo tipo e na ordem correta.",
    constraints: ["1 <= len(s) <= 10⁴", "s contém apenas ( ) [ ] { }"],
    fn: "is_valid",
    cpp: "isValid",
    params: [["s", "string"]],
    returns: "bool",
    tests: [
      [["()"], true],
      [["()[]{}"], true],
      [["(]"], false],
      [["([)]"], false],
      [["{[]}"], true],
    ],
  },
  {
    id: "longest-substring-no-repeat",
    title: "Maior substring sem repetição",
    difficulty: "medio",
    topic: "Janela deslizante",
    statement: "Dada uma string `s`, retorne o tamanho da **maior substring** que não tem caracteres repetidos.",
    constraints: ["0 <= len(s) <= 5·10⁴", "s tem letras, dígitos, símbolos e espaços (ASCII)"],
    fn: "length_of_longest_substring",
    cpp: "lengthOfLongestSubstring",
    params: [["s", "string"]],
    returns: "int",
    tests: [
      [["abcabcbb"], 3],
      [["bbbbb"], 1],
      [["pwwkew"], 3],
      [[""], 0],
      [["abba"], 2],
    ],
    notes: ['"abc"', '"b"', '"wke"'],
  },

  // ----- Busca binária -----------------------------------------------------
  {
    id: "binary-search",
    title: "Busca binária",
    difficulty: "facil",
    topic: "Busca binária",
    statement:
      "Dado um array `nums` ordenado de forma crescente e um `target`, retorne o índice de `target`, ou `-1` se não existir. Precisa rodar em O(log n).",
    constraints: ["1 <= len(nums) <= 10⁴", "-10⁴ < nums[i], target < 10⁴", "Valores distintos e ordenados"],
    fn: "search",
    cpp: "search",
    params: [["nums", "int[]"], ["target", "int"]],
    returns: "int",
    tests: [
      [[[-1, 0, 3, 5, 9, 12], 9], 4],
      [[[-1, 0, 3, 5, 9, 12], 2], -1],
      [[[5], 5], 0],
      [[[-1, 0, 3, 5, 9, 12], -1], 0],
      [[[-1, 0, 3, 5, 9, 12], 12], 5],
    ],
  },
  {
    id: "search-rotated",
    title: "Busca em array rotacionado",
    difficulty: "medio",
    topic: "Busca binária",
    statement:
      "Um array ordenado e de valores distintos foi **rotacionado** em algum pivô (ex.: `[0,1,2,4,5,6,7]` virou `[4,5,6,7,0,1,2]`). Dado `nums` e `target`, retorne o índice de `target` ou `-1`. Em O(log n).",
    constraints: ["1 <= len(nums) <= 5000", "-10⁴ <= nums[i], target <= 10⁴", "Valores distintos"],
    fn: "search_rotated",
    cpp: "searchRotated",
    params: [["nums", "int[]"], ["target", "int"]],
    returns: "int",
    tests: [
      [[[4, 5, 6, 7, 0, 1, 2], 0], 4],
      [[[4, 5, 6, 7, 0, 1, 2], 3], -1],
      [[[1], 0], -1],
      [[[3, 1], 1], 1],
      [[[5, 1, 3], 5], 0],
    ],
  },

  // ----- Programação dinâmica ----------------------------------------------
  {
    id: "climbing-stairs",
    title: "Subindo escadas",
    difficulty: "facil",
    topic: "Programação dinâmica",
    statement:
      "Uma escada tem `n` degraus. A cada passo você sobe 1 ou 2 degraus. De quantas formas **distintas** é possível chegar ao topo?",
    constraints: ["1 <= n <= 45"],
    fn: "climb_stairs",
    cpp: "climbStairs",
    params: [["n", "int"]],
    returns: "int",
    tests: [
      [[2], 2],
      [[3], 3],
      [[5], 8],
      [[1], 1],
      [[45], 1836311903],
    ],
    notes: ["1+1 ou 2", "1+1+1, 1+2 ou 2+1"],
  },
];

export const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: "facil", label: "Fácil" },
  { id: "medio", label: "Médio" },
];

// Ordenada por nível (fácil primeiro); dentro do nível, mantém a ordem do banco.
export const problemList: PublicProblem[] = DEFS.map(define).sort(
  (a, b) => DIFFICULTIES.findIndex((d) => d.id === a.difficulty) - DIFFICULTIES.findIndex((d) => d.id === b.difficulty),
);

/** Questões separadas por nível de dificuldade. */
export const problemsByDifficulty: Record<Difficulty, PublicProblem[]> = {
  facil: problemList.filter((p) => p.difficulty === "facil"),
  medio: problemList.filter((p) => p.difficulty === "medio"),
};

export const problems: Record<string, PublicProblem> = Object.fromEntries(problemList.map((p) => [p.id, p]));

/** Problema padrão (e reserva quando o id não existe). */
export const twoSum: PublicProblem = problems["two-sum"];

export function getProblem(id: string | null | undefined): PublicProblem {
  return (id && problems[id]) || twoSum;
}

/** Nível sugerido por senioridade, quando a vaga não define `difficulty`. */
export function difficultyForSeniority(seniority: "junior" | "pleno" | "senior"): Difficulty {
  return seniority === "junior" ? "facil" : "medio";
}

/**
 * Questão da entrevista, a partir da config definida pelo agente: usa `problemId`
 * se ele existe e é do nível pedido; senão, a primeira questão do nível.
 */
export function resolveProblem(config: { problemId: string; difficulty?: Difficulty }): PublicProblem {
  const chosen = problems[config.problemId];
  if (chosen && (!config.difficulty || chosen.difficulty === config.difficulty)) return chosen;
  return config.difficulty ? problemsByDifficulty[config.difficulty][0] : twoSum;
}

/** Para o agente de pré-entrevista: ids do banco no nível da vaga (ele escolhe um). */
export function problemIdsFor(difficulty: Difficulty): string[] {
  return problemsByDifficulty[difficulty].map((p) => p.id);
}
