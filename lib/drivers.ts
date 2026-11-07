/**
 * Drivers de teste para C e C++, gerados a partir da assinatura do problema
 * (`problem.native`). O driver embrulha o código do candidato num `main` que roda
 * os testes públicos e imprime uma linha por caso: `@@<índice>|<0 ou 1>|<resultado>`.
 *
 * Tipos suportados: int, bool, string e int[] (parâmetros e retorno).
 */
import type { NativeType, PublicProblem } from "@/lib/problems";

export type NativeLanguage = "c" | "cpp";

const ints = (a: unknown) => (a as number[]).join(", ");
const str = (s: unknown) => JSON.stringify(s as string); // literal de string C (ASCII)

// ---------------------------------------------------------------------------
// C++
// ---------------------------------------------------------------------------

function cppLiteral(type: NativeType, v: unknown): string {
  switch (type) {
    case "int[]":
      return `vector<int>{${ints(v)}}`;
    case "string":
      return `string(${str(v)})`;
    case "bool":
      return v ? "true" : "false";
    default:
      return String(v);
  }
}

function buildCpp(problem: PublicProblem, userCode: string): string {
  const { native } = problem;
  const sorted = problem.compare === "sorted";
  const blocks = problem.visibleTests.map((t, i) => {
    const decls = native.params.map(
      (p, k) =>
        `${p.type === "int[]" ? "vector<int>" : p.type === "string" ? "string" : p.type} a${k} = ${cppLiteral(p.type, t.args[k])};`,
    );
    const call = `${native.cppName}(${native.params.map((_, k) => `a${k}`).join(", ")})`;
    return `    { // caso ${i}
        try {
            ${decls.join("\n            ")}
            auto got = ${call};
            bool ok = __same(got, ${cppLiteral(native.returns, t.expected)}, ${sorted});
            printf("@@${i}|%d|%s\\n", ok ? 1 : 0, __fmt(got).c_str());
        } catch (...) {
            printf("@@${i}|0|ERRO: exceção\\n");
        }
        fflush(stdout);
    }`;
  });

  return `#include <vector>
#include <algorithm>
#include <iostream>
#include <unordered_map>
#include <unordered_set>
#include <map>
#include <set>
#include <stack>
#include <queue>
#include <string>
#include <numeric>
#include <climits>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <utility>
using namespace std;

${userCode}

static string __fmt(const vector<int>& v) {
    string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ", "; s += to_string(v[i]); }
    return s + "]";
}
static string __fmt(int v) { return to_string(v); }
static string __fmt(bool v) { return v ? "true" : "false"; }
static string __fmt(const string& v) { return "\\"" + v + "\\""; }

template <class T> static bool __same(const T& a, const T& b, bool) { return a == b; }
static bool __same(const vector<int>& a, const vector<int>& b, bool sorted) {
    vector<int> x = a, y = b;
    if (sorted) { sort(x.begin(), x.end()); sort(y.begin(), y.end()); }
    return x == y;
}

int main() {
${blocks.join("\n")}
    return 0;
}
`;
}

// ---------------------------------------------------------------------------
// C
// ---------------------------------------------------------------------------

function buildC(problem: PublicProblem, userCode: string): string {
  const { native } = problem;
  const sorted = problem.compare === "sorted";
  const blocks = problem.visibleTests.map((t, i) => {
    const decls: string[] = [];
    const args: string[] = [];
    native.params.forEach((p, k) => {
      const v = t.args[k];
      if (p.type === "int[]") {
        const arr = v as number[];
        decls.push(arr.length ? `int a${k}[] = {${ints(arr)}};` : `int a${k}[1] = {0};`);
        args.push(`a${k}`, String(arr.length));
      } else if (p.type === "string") {
        decls.push(`char a${k}[] = ${str(v)};`);
        args.push(`a${k}`);
      } else if (p.type === "bool") {
        args.push(v ? "true" : "false");
      } else {
        args.push(String(v));
      }
    });
    if (native.returns === "int[]") {
      decls.push("int rs = 0;");
      args.push("&rs");
    }
    const call = `${native.cppName}(${args.join(", ")})`;
    const exp = t.expected;
    let check: string;
    switch (native.returns) {
      case "int[]": {
        const e = exp as number[];
        check = `int e[] = {${e.length ? ints(e) : "0"}};
        int *got = ${call};
        bool ok = got != NULL && __same_arr(got, rs, e, ${e.length}, ${sorted ? 1 : 0});
        printf("@@${i}|%d|", ok ? 1 : 0);
        __print_arr(got, rs);`;
        break;
      }
      case "string":
        check = `char *got = ${call};
        bool ok = got != NULL && strcmp(got, ${str(exp)}) == 0;
        printf("@@${i}|%d|\\"%s\\"\\n", ok ? 1 : 0, got ? got : "(null)");`;
        break;
      case "bool":
        check = `bool got = ${call};
        bool ok = got == ${exp ? "true" : "false"};
        printf("@@${i}|%d|%s\\n", ok ? 1 : 0, got ? "true" : "false");`;
        break;
      default:
        check = `int got = ${call};
        bool ok = got == ${exp};
        printf("@@${i}|%d|%d\\n", ok ? 1 : 0, got);`;
    }
    return `    { // caso ${i}
        ${decls.join("\n        ")}
        ${check}
        fflush(stdout);
    }`;
  });

  return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <limits.h>

${userCode}

static int __cmp_int(const void *a, const void *b) {
    int x = *(const int *)a, y = *(const int *)b;
    return (x > y) - (x < y);
}
static bool __same_arr(const int *got, int n, const int *exp, int m, int sorted) {
    if (n != m) return false;
    int *x = malloc((n ? n : 1) * sizeof(int)), *y = malloc((m ? m : 1) * sizeof(int));
    memcpy(x, got, n * sizeof(int));
    memcpy(y, exp, m * sizeof(int));
    if (sorted) { qsort(x, n, sizeof(int), __cmp_int); qsort(y, m, sizeof(int), __cmp_int); }
    bool eq = memcmp(x, y, n * sizeof(int)) == 0;
    free(x); free(y);
    return eq;
}
static void __print_arr(const int *a, int n) {
    printf("[");
    for (int k = 0; a != NULL && k < n; k++) printf(k ? ", %d" : "%d", a[k]);
    printf("]\\n");
}

int main(void) {
${blocks.join("\n")}
    return 0;
}
`;
}

export function buildDriver(lang: NativeLanguage, problem: PublicProblem, userCode: string): string {
  return lang === "cpp" ? buildCpp(problem, userCode) : buildC(problem, userCode);
}
