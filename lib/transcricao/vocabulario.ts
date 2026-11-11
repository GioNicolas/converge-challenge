/**
 * Vocabulário (keyterms) que o Scribe em tempo real usa para acertar termos técnicos. O parâmetro vai na URL do
 * WebSocket, repetido (`keyterms=a&keyterms=b`), e o Scribe aceita até 50 termos de até 20 caracteres
 * (`@elevenlabs/client`, `scribe.d.ts`). Tudo aqui é público: termos de área e de enunciado, nada da rubrica.
 */
export const MAX_TERMOS = 50;
export const MAX_CARACTERES_TERMO = 20;

/** Limpa, tira repetidos (sem diferenciar maiúsculas) e respeita os limites do Scribe; a ordem é a prioridade. */
export function normalizarTermos(...listas: readonly (readonly string[] | undefined)[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const lista of listas) {
    for (const bruto of lista ?? []) {
      const termo = bruto.replace(/\s+/gu, " ").trim();
      if (!termo || termo.length > MAX_CARACTERES_TERMO) continue;
      const chave = termo.toLocaleLowerCase("pt-BR");
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(termo);
      if (saida.length >= MAX_TERMOS) return saida;
    }
  }
  return saida;
}

/** Pré-entrevista: o que a recrutadora fala ao montar uma vaga de tecnologia. */
export const TERMOS_RECRUTAMENTO: readonly string[] = [
  "live coding", "system design", "sênior", "pleno", "júnior", "backend", "frontend", "full stack",
  "two sum", "tech lead", "senioridade", "stack", "deploy", "microsserviços", "Kubernetes", "React", "Node",
  "TypeScript", "Python", "Java", "Go", "SQL", "AWS", "pair programming", "code review", "escalabilidade",
  "resolução de problemas", "comunicação", "uso de IA", "pressão", "entrevista técnica", "squad", "CLT", "PJ",
];

/** Palavras que não ajudam o reconhecedor (curtas demais ou comuns em qualquer frase). */
const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "pra", "com", "a", "o", "as", "os", "um", "uma", "na", "no",
  "vaga", "pessoa", "dev", "desenvolvedor", "desenvolvedora",
]);

/** Termos do título da vaga ("Backend Pleno - Pagamentos" → "Backend Pleno - Pagamentos", "Backend", "Pagamentos"). */
export function termosDoTitulo(titulo: string | undefined): string[] {
  const limpo = (titulo ?? "").replace(/\s+/gu, " ").trim();
  if (!limpo) return [];
  const palavras = limpo.split(/[\s/,;()|·–—-]+/u)
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p.toLocaleLowerCase("pt-BR")));
  return normalizarTermos([limpo], palavras);
}

/** Live coding: o que se fala sobre qualquer solução. */
const TERMOS_CODIGO: readonly string[] = [
  "complexidade", "big O", "O de n", "hash map", "dicionário", "array", "lista", "pilha", "fila", "índice",
  "ponteiro", "two pointers", "loop", "recursão", "caso de borda", "teste", "função", "retorno", "string",
  "inteiro", "ordenar", "busca binária", "janela deslizante", "memoização",
];

const TERMOS_LINGUAGEM: Record<string, readonly string[]> = {
  python: ["Python", "dict", "set", "enumerate", "append", "len", "range", "def", "None"],
  cpp: ["C++", "vector", "unordered_map", "push_back", "size", "std", "ponteiro", "referência"],
  c: ["C", "malloc", "struct", "ponteiro", "free", "sizeof"],
  javascript: ["JavaScript", "Map", "Set", "push", "length", "const", "let", "undefined"],
  typescript: ["TypeScript", "Map", "Set", "push", "length", "const", "let", "undefined"],
  java: ["Java", "HashMap", "ArrayList", "HashSet", "length", "null"],
};

/** Vocabulário do enunciado de cada problema do banco (`problems/`). */
const TERMOS_PROBLEMA: Record<string, readonly string[]> = {
  "two-sum": ["dicionário de pares", "par", "complemento", "target", "soma", "nums"],
  "top-k-frequent": ["frequência", "k mais frequentes", "heap", "bucket sort", "contagem"],
  "best-time-stock": ["preço", "lucro", "comprar", "vender", "mínimo", "ação"],
  "maximum-subarray": ["subarray", "Kadane", "soma máxima", "contíguo"],
  "daily-temperatures": ["temperatura", "pilha monotônica", "dias", "mais quente"],
  "valid-parentheses": ["parênteses", "colchetes", "chaves", "abre", "fecha", "balanceado"],
  "longest-substring-no-repeat": ["substring", "janela", "repetido", "caractere"],
  "binary-search": ["busca binária", "meio", "esquerda", "direita", "ordenado"],
  "search-rotated": ["rotacionado", "pivô", "busca binária", "metade ordenada"],
  "climbing-stairs": ["degrau", "escada", "Fibonacci", "programação dinâmica"],
};

/** Live coding: termos do problema e da linguagem primeiro (são os mais específicos), depois os gerais. */
export function termosDoLiveCoding({ problemaId, titulo, linguagem }: {
  problemaId?: string; titulo?: string; linguagem?: string;
}): string[] {
  return normalizarTermos(
    titulo ? [titulo] : [],
    problemaId ? TERMOS_PROBLEMA[problemaId] : [],
    linguagem ? TERMOS_LINGUAGEM[linguagem.toLowerCase()] : [],
    TERMOS_CODIGO,
  );
}
