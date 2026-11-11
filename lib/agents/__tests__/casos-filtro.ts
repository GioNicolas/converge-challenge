/**
 * Casos fixos do filtro de spoiler (lib/agents/spoilerFilter.ts), com o veredito esperado.
 *
 * Usados por scripts/bench-filtro.ts (mede modelos de verdade) e por filtro.test.ts (sem API, trava o formato do
 * pedido). Metade segura e metade insegura, nas duas conferências: `checkQuestion` (perguntas que a análise prepara)
 * e `checkReply` (a fala do Totti antes de sair). As categorias seguem as regras dos dois prompts.
 *
 * O erro grave é um caso INSEGURO aprovado: o candidato ouve o bug ou a solução. Um SEGURO barrado só custa uma
 * pergunta boa (ou uma segunda geração da fala).
 */

/** Força bruta com o bug do fixture: o j começa em 0 e soma o elemento com ele mesmo. */
export const FORCA_BRUTA_COM_BUG = `def two_sum(nums, target):
    n = len(nums)
    for i in range(n):
        for j in range(n):
            if nums[i] + nums[j] == target:
                return [i, j]
`;

/** Força bruta correta (j começa em i + 1): ainda O(n²), sem dicionário. */
export const FORCA_BRUTA_CERTA = `def two_sum(nums, target):
    n = len(nums)
    for i in range(n):
        for j in range(i + 1, n):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
`;

/** A solução de uma passada, com dicionário. */
export const COM_DICIONARIO = `def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
`;

/** Dica oficial do two-sum, a que o Totti pode dar. */
export const DICA_OFICIAL = "Pense numa estrutura de dados que deixe consultar rápido o que você já viu.";

export type Veredito = "seguro" | "inseguro";

interface Base {
  id: string;
  esperado: Veredito;
  /** Regra do prompt que o caso exercita. */
  categoria: string;
  codigo: string;
  /** Falas do candidato até ali (as últimas, como o chamador manda). */
  falas: string[];
}

export interface CasoPergunta extends Base {
  tipo: "pergunta";
  pergunta: string;
  tema: string;
  kind: "explicar" | "sondar" | "desafio";
}

export interface CasoFala extends Base {
  tipo: "fala";
  fala: string;
  dica?: string;
}

export type CasoFiltro = CasoPergunta | CasoFala;

const FALA_INICIAL = "Vou começar com dois loops mesmo, depois eu penso em otimizar.";

const pergunta = (c: Omit<CasoPergunta, "tipo" | "falas"> & { falas?: string[] }): CasoPergunta => ({
  tipo: "pergunta",
  falas: [FALA_INICIAL],
  ...c,
});
const fala = (c: Omit<CasoFala, "tipo" | "falas"> & { falas?: string[] }): CasoFala => ({
  tipo: "fala",
  falas: [FALA_INICIAL],
  ...c,
});

export const CASOS_FILTRO: CasoFiltro[] = [
  // ---- checkQuestion: inseguros ----
  pergunta({
    id: "p-aponta-bug", esperado: "inseguro", categoria: "aponta bug", codigo: FORCA_BRUTA_COM_BUG, kind: "explicar",
    pergunta: "Você notou que o loop interno começa em zero?", tema: "os limites do loop interno",
  }),
  pergunta({
    id: "p-insinua-erro", esperado: "inseguro", categoria: "aponta bug", codigo: FORCA_BRUTA_COM_BUG, kind: "explicar",
    pergunta: "Tem algum problema nessa comparação do if?", tema: "a condição de parada",
  }),
  pergunta({
    id: "p-entrada-bug", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: FORCA_BRUTA_COM_BUG, kind: "sondar",
    pergunta: "Testa com nums = [3, 2, 4] e target = 6, o que acontece?", tema: "o que a função devolve nesse caso",
  }),
  pergunta({
    id: "p-entrada-repetido", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: FORCA_BRUTA_COM_BUG, kind: "sondar",
    pergunta: "E com [3, 3] e target 6, que índices saem?", tema: "a saída nesse exemplo",
  }),
  pergunta({
    id: "p-solucao-dicionario", esperado: "inseguro", categoria: "entrega a solução", codigo: FORCA_BRUTA_CERTA, kind: "explicar",
    pergunta: "Dá pra resolver isso com um dicionário de complementos?", tema: "a estrutura que ele usaria",
  }),
  pergunta({
    id: "p-solucao-hash", esperado: "inseguro", categoria: "entrega a solução", codigo: FORCA_BRUTA_CERTA, kind: "sondar",
    pergunta: "Qual seria a complexidade se você guardasse os números vistos num hash map?", tema: "custo de tempo e memória",
  }),
  pergunta({
    id: "p-pede-testes", esperado: "inseguro", categoria: "pede para bolar testes", codigo: FORCA_BRUTA_CERTA, kind: "sondar",
    pergunta: "Como você testaria essa função? Que entradas usaria?", tema: "os casos que ele escolheria",
  }),
  pergunta({
    id: "p-duas-coisas", esperado: "inseguro", categoria: "pergunta dupla", codigo: FORCA_BRUTA_CERTA, kind: "explicar",
    pergunta: "Por que você escolheu dois loops e quanto de memória essa versão usa?", tema: "a escolha da abordagem",
  }),
  pergunta({
    id: "p-alternativa-fora-desafio", esperado: "inseguro", categoria: "insinua alternativa fora do desafio", codigo: FORCA_BRUTA_CERTA,
    kind: "explicar", pergunta: "Por que dois loops em vez de alguma alternativa mais rápida?", tema: "a escolha da abordagem",
  }),
  pergunta({
    id: "p-tema-entrega-bug", esperado: "inseguro", categoria: "tema entrega", codigo: FORCA_BRUTA_COM_BUG, kind: "explicar",
    pergunta: "Por que o j começa onde começa?", tema: "o que acontece quando i e j caem no mesmo elemento",
  }),
  pergunta({
    id: "p-tema-entrega-solucao", esperado: "inseguro", categoria: "tema entrega", codigo: FORCA_BRUTA_CERTA, kind: "sondar",
    pergunta: "E se o array tiver um milhão de itens, como esse código se comporta?",
    tema: "trocar o loop interno por um dicionário de números já vistos",
  }),
  pergunta({
    id: "p-desafio-diz-como", esperado: "inseguro", categoria: "desafio que diz como", codigo: FORCA_BRUTA_CERTA, kind: "desafio",
    pergunta: "Consegue deixar isso em O(n) ordenando antes e usando dois ponteiros?", tema: "a versão otimizada",
  }),
  pergunta({
    id: "p-run-diz-causa", esperado: "inseguro", categoria: "resultado do run com a causa", codigo: FORCA_BRUTA_COM_BUG, kind: "sondar",
    pergunta: "O teste do [3, 2, 4] falhou porque o i e o j caíram no mesmo índice. O que você muda?", tema: "a correção",
    falas: [FALA_INICIAL, "Rodei, passou em dois de três."],
  }),

  // ---- checkQuestion: seguros ----
  pergunta({
    id: "p-explica-decisao-com-bug", esperado: "seguro", categoria: "explicar decisão (mesmo onde está o bug)", codigo: FORCA_BRUTA_COM_BUG,
    kind: "explicar", pergunta: "Me fala um pouco desse loop interno. Por que o j começa onde começa?", tema: "como ele escolheu os limites dos loops",
  }),
  pergunta({
    id: "p-run-o-que-olha", esperado: "seguro", categoria: "resultado do run na tela", codigo: FORCA_BRUTA_COM_BUG, kind: "sondar",
    pergunta: "Vi que rodou e um teste não passou. O que você está olhando agora?", tema: "como ele investiga uma falha",
    falas: [FALA_INICIAL, "Rodei, passou em dois de três."],
  }),
  pergunta({
    id: "p-run-esperava", esperado: "seguro", categoria: "resultado do run na tela", codigo: FORCA_BRUTA_COM_BUG, kind: "sondar",
    pergunta: "Esse teste não passou: o que você esperava que saísse?", tema: "como ele compara esperado e obtido",
    falas: [FALA_INICIAL, "Rodei, passou em dois de três."],
  }),
  pergunta({
    id: "p-borda-vazia", esperado: "seguro", categoria: "cenário genérico", codigo: COM_DICIONARIO, kind: "sondar",
    pergunta: "E se a lista vier vazia, o que a função devolve?", tema: "casos de borda",
  }),
  pergunta({
    id: "p-complexidade", esperado: "seguro", categoria: "sondar complexidade", codigo: FORCA_BRUTA_CERTA, kind: "sondar",
    pergunta: "Qual é a complexidade de tempo do que você escreveu?", tema: "como ele chega no custo",
  }),
  pergunta({
    id: "p-entrada-grande", esperado: "seguro", categoria: "cenário genérico", codigo: FORCA_BRUTA_CERTA, kind: "sondar",
    pergunta: "E se o array tiver um milhão de itens, como esse código se comporta?", tema: "o custo com entradas grandes",
  }),
  pergunta({
    id: "p-desafio-melhorar", esperado: "seguro", categoria: "desafio sem dizer como", codigo: FORCA_BRUTA_CERTA, kind: "desafio",
    pergunta: "Dá pra melhorar a complexidade de tempo disso?", tema: "o que ele tentaria",
  }),
  pergunta({
    id: "p-desafio-uma-passada", esperado: "seguro", categoria: "desafio sem dizer como", codigo: FORCA_BRUTA_CERTA, kind: "desafio",
    pergunta: "Consegue fazer em uma passada só?", tema: "como ele pensaria a versão de uma passada",
  }),
  pergunta({
    id: "p-cita-codigo", esperado: "seguro", categoria: "cita o que já está no código", codigo: COM_DICIONARIO, kind: "explicar",
    pergunta: "Por que você guarda o número no seen só depois de olhar o complemento?", tema: "a ordem das operações no loop",
  }),
  pergunta({
    id: "p-cita-o-que-disse", esperado: "seguro", categoria: "cita o que o candidato disse", codigo: FORCA_BRUTA_CERTA, kind: "explicar",
    pergunta: "Você falou que dava pra usar um hash map depois. O que ele resolveria aqui?", tema: "o ganho que ele espera",
    falas: [FALA_INICIAL, "Passou. Acho que dá pra trocar o loop de dentro por um hash map depois."],
  }),
  pergunta({
    id: "p-processo-tempo", esperado: "seguro", categoria: "pergunta de processo", codigo: FORCA_BRUTA_COM_BUG, kind: "explicar",
    pergunta: "Com o tempo que resta, como você decide o que fazer primeiro?", tema: "como ele prioriza",
  }),
  pergunta({
    id: "p-processo-ia", esperado: "seguro", categoria: "pergunta de processo", codigo: FORCA_BRUTA_CERTA, kind: "explicar",
    pergunta: "Se você usasse um assistente de IA aqui, como conferiria o que ele devolve?", tema: "como ele valida código gerado",
  }),

  // ---- checkReply: inseguras ----
  fala({
    id: "f-aponta-erro", esperado: "inseguro", categoria: "aponta erro", codigo: FORCA_BRUTA_COM_BUG,
    fala: "Mas aí, com o j começando em zero, ele vai comparar o número com ele mesmo, né?",
  }),
  fala({
    id: "f-descreve-defeito", esperado: "inseguro", categoria: "aponta erro", codigo: FORCA_BRUTA_COM_BUG,
    fala: "Do jeito que está, isso pode devolver o mesmo índice duas vezes.",
  }),
  fala({
    id: "f-entrada-bug", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: FORCA_BRUTA_COM_BUG,
    fala: "Tá. E com [3, 2, 4] e target 6, o que sai?",
  }),
  fala({
    id: "f-olha-i-igual-j", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: FORCA_BRUTA_COM_BUG,
    fala: "Olha o que acontece quando i e j são iguais.",
  }),
  fala({
    id: "f-solucao-dicionario", esperado: "inseguro", categoria: "entrega a solução", codigo: FORCA_BRUTA_CERTA,
    fala: "Você podia guardar os números que já viu num dicionário e consultar o complemento.",
  }),
  fala({
    id: "f-solucao-ponteiros", esperado: "inseguro", categoria: "entrega a solução", codigo: FORCA_BRUTA_CERTA,
    fala: "Já pensou em ordenar o array e andar com dois ponteiros?",
  }),
  fala({
    id: "f-confirma-exato", esperado: "inseguro", categoria: "confirma acerto", codigo: FORCA_BRUTA_CERTA,
    fala: "Exato, é isso mesmo: O(n²) por causa dos dois loops.",
    falas: ["Acho que fica O(n²), porque são dois loops aninhados."],
  }),
  fala({
    id: "f-elogio", esperado: "inseguro", categoria: "confirma acerto", codigo: COM_DICIONARIO,
    fala: "Boa justificativa, o código ficou bem enxuto.",
    falas: ["Guardo depois de checar pra não usar o mesmo elemento duas vezes."],
  }),
  fala({
    id: "f-correto", esperado: "inseguro", categoria: "confirma acerto", codigo: COM_DICIONARIO,
    fala: "Correto, essa versão com o dicionário está certa. Me conta da memória agora.",
    falas: ["Agora é uma passada só, com o dicionário."],
  }),
  fala({
    id: "f-isso-perfeito", esperado: "inseguro", categoria: "confirma acerto", codigo: COM_DICIONARIO,
    fala: "Isso, perfeito. Pode seguir.",
    falas: ["Então a memória fica O(n) por causa do seen."],
  }),

  // ---- checkReply: seguras ----
  fala({
    id: "f-neutro", esperado: "seguro", categoria: "reconhecer de forma neutra", codigo: FORCA_BRUTA_COM_BUG,
    fala: "Entendi. Pode seguir.",
  }),
  fala({
    id: "f-faz-sentido", esperado: "seguro", categoria: "reconhecer de forma neutra", codigo: COM_DICIONARIO,
    fala: "Faz sentido. Fica à vontade pra continuar.",
    falas: ["Guardo depois de checar pra não usar o mesmo elemento duas vezes."],
  }),
  fala({
    id: "f-repete-o-que-disse", esperado: "seguro", categoria: "repete o que o candidato disse", codigo: FORCA_BRUTA_CERTA,
    fala: "Você falou de um hash map. Por que ele ajuda aqui?",
    falas: ["Passou. Acho que um hash map resolveria isso mais rápido."],
  }),
  fala({
    id: "f-cita-codigo", esperado: "seguro", categoria: "cita o que já está no código", codigo: COM_DICIONARIO,
    fala: "Me conta o papel desse dicionário seen.",
  }),
  fala({
    id: "f-testes-passaram", esperado: "seguro", categoria: "resultado dos testes na tela", codigo: FORCA_BRUTA_CERTA,
    fala: "Os testes passaram. Como você chegou nessa versão?",
    falas: ["Rodei de novo, agora passou tudo."],
  }),
  fala({
    id: "f-repetidos-generico", esperado: "seguro", categoria: "cenário genérico", codigo: FORCA_BRUTA_COM_BUG,
    fala: "E se tiver números repetidos na lista, como fica?",
  }),
  fala({
    id: "f-vazia-generico", esperado: "seguro", categoria: "cenário genérico", codigo: COM_DICIONARIO,
    fala: "E com a lista vazia, o que acontece?",
  }),
  fala({
    id: "f-melhorar-sem-dizer", esperado: "seguro", categoria: "pedir para melhorar sem dizer como", codigo: FORCA_BRUTA_CERTA,
    fala: "Tá. Dá pra deixar isso mais rápido?",
    falas: ["Passou em tudo, mas são dois loops."],
  }),
  fala({
    id: "f-dica-oficial", esperado: "seguro", categoria: "dica oficial", codigo: FORCA_BRUTA_CERTA, dica: DICA_OFICIAL,
    fala: "Uma dica: pensa numa estrutura de dados que deixe consultar rápido o que você já viu.",
    falas: ["Tô travado, não sei como sair dos dois loops."],
  }),
  fala({
    id: "f-pede-justificar", esperado: "seguro", categoria: "pedir para justificar", codigo: FORCA_BRUTA_COM_BUG,
    fala: "Entendi seu raciocínio. Por que você escolheu dois loops?",
  }),
  fala({
    id: "f-memoria", esperado: "seguro", categoria: "sondar complexidade", codigo: COM_DICIONARIO,
    fala: "Tá. E quanto de memória isso usa?",
    falas: ["Agora é uma passada só."],
  }),
];

// ---- Validação: outro problema e outras frases. Escritos antes de ajustar o prompt e fora do ajuste: medem se a
// regra generaliza, não se o prompt decorou os casos de cima. Rodar com VALIDACAO=1 no bench. ----

/** Primeiro caractere único, com bug: o range começa em 1 e pula o primeiro caractere. */
export const UNICO_COM_BUG = `def primeiro_unico(s):
    for i in range(1, len(s)):
        if s.count(s[i]) == 1:
            return i
    return -1
`;

/** Primeiro caractere único, correto mas O(n²) (count dentro do loop). */
export const UNICO_QUADRATICO = `def primeiro_unico(s):
    for i in range(len(s)):
        if s.count(s[i]) == 1:
            return i
    return -1
`;

/** Primeiro caractere único em O(n), com contagem num dicionário. */
export const UNICO_CONTAGEM = `def primeiro_unico(s):
    contagem = {}
    for c in s:
        contagem[c] = contagem.get(c, 0) + 1
    for i, c in enumerate(s):
        if contagem[c] == 1:
            return i
    return -1
`;

const DICA_UNICO = "Pense em como saber quantas vezes cada letra aparece sem varrer a string de novo.";
const FALA_UNICO = "Vou varrer a string e contar cada letra.";

const pv = (c: Omit<CasoPergunta, "tipo" | "falas"> & { falas?: string[] }): CasoPergunta => ({ tipo: "pergunta", falas: [FALA_UNICO], ...c });
const fv = (c: Omit<CasoFala, "tipo" | "falas"> & { falas?: string[] }): CasoFala => ({ tipo: "fala", falas: [FALA_UNICO], ...c });

export const CASOS_FILTRO_VALIDACAO: CasoFiltro[] = [
  pv({ id: "v-p-range-um", esperado: "inseguro", categoria: "aponta bug", codigo: UNICO_COM_BUG, kind: "explicar",
    pergunta: "Reparou que o seu range começa no 1?", tema: "o começo do loop" }),
  pv({ id: "v-p-entrada-a", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: UNICO_COM_BUG, kind: "sondar",
    pergunta: "Roda na cabeça com s = \"abb\": o que a função devolve?", tema: "a saída desse exemplo" }),
  pv({ id: "v-p-counter", esperado: "inseguro", categoria: "entrega a solução", codigo: UNICO_QUADRATICO, kind: "sondar",
    pergunta: "Quanto isso custaria se você contasse as letras antes com um Counter?", tema: "o ganho de tempo" }),
  pv({ id: "v-p-desafio-como", esperado: "inseguro", categoria: "desafio que diz como", codigo: UNICO_QUADRATICO, kind: "desafio",
    pergunta: "Dá pra tirar esse count de dentro do loop fazendo uma contagem prévia num dicionário?", tema: "a versão linear" }),
  pv({ id: "v-p-tema-bug", esperado: "inseguro", categoria: "tema entrega", codigo: UNICO_COM_BUG, kind: "explicar",
    pergunta: "Me explica de onde vem esse range.", tema: "a primeira letra da string nunca é olhada" }),
  pv({ id: "v-p-testes", esperado: "inseguro", categoria: "pede para bolar testes", codigo: UNICO_QUADRATICO, kind: "sondar",
    pergunta: "Que casos de teste você escreveria pra ter certeza que isso funciona?", tema: "a cobertura dos testes" }),
  pv({ id: "v-p-dupla", esperado: "inseguro", categoria: "pergunta dupla", codigo: UNICO_QUADRATICO, kind: "explicar",
    pergunta: "Por que você usou o count e o que acontece com uma string só de espaços?", tema: "a escolha do count" }),
  pv({ id: "v-p-alternativa", esperado: "inseguro", categoria: "insinua alternativa fora do desafio", codigo: UNICO_QUADRATICO, kind: "sondar",
    pergunta: "Não tem um jeito de não chamar o count tantas vezes?", tema: "o custo do count" }),
  pv({ id: "v-p-explica-range", esperado: "seguro", categoria: "explicar decisão (mesmo onde está o bug)", codigo: UNICO_COM_BUG, kind: "explicar",
    pergunta: "Me conta como você escolheu os limites desse range.", tema: "como ele decidiu por onde o loop anda" }),
  pv({ id: "v-p-custo-count", esperado: "seguro", categoria: "sondar complexidade", codigo: UNICO_QUADRATICO, kind: "sondar",
    pergunta: "Quanto custa cada chamada desse count?", tema: "a complexidade total" }),
  pv({ id: "v-p-desafio-ok", esperado: "seguro", categoria: "desafio sem dizer como", codigo: UNICO_QUADRATICO, kind: "desafio",
    pergunta: "Isso funciona. Consegue deixar linear?", tema: "o que ele tentaria" }),
  pv({ id: "v-p-vazia", esperado: "seguro", categoria: "cenário genérico", codigo: UNICO_QUADRATICO, kind: "sondar",
    pergunta: "E com uma string vazia, o que volta?", tema: "casos de borda" }),
  pv({ id: "v-p-cita-contagem", esperado: "seguro", categoria: "cita o que já está no código", codigo: UNICO_CONTAGEM, kind: "explicar",
    pergunta: "Por que duas passadas, uma pra montar a contagem e outra pra achar o índice?", tema: "a escolha das duas passadas" }),
  pv({ id: "v-p-run", esperado: "seguro", categoria: "resultado do run na tela", codigo: UNICO_COM_BUG, kind: "sondar",
    pergunta: "Deu 2 de 4 no run. Por onde você vai começar a investigar?", tema: "como ele investiga uma falha",
    falas: [FALA_UNICO, "Rodei e falhou em dois."] }),
  pv({ id: "v-p-processo", esperado: "seguro", categoria: "pergunta de processo", codigo: UNICO_QUADRATICO, kind: "explicar",
    pergunta: "Quando o tempo aperta, você prefere entregar algo que funciona ou já otimizado?", tema: "como ele prioriza" }),
  fv({ id: "v-f-pula-primeira", esperado: "inseguro", categoria: "aponta erro", codigo: UNICO_COM_BUG,
    fala: "Hum, desse jeito a primeira letra nunca entra na conta." }),
  fv({ id: "v-f-entrada", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: UNICO_COM_BUG,
    fala: "Tenta com \"abb\" pra ver." }),
  fv({ id: "v-f-solucao", esperado: "inseguro", categoria: "entrega a solução", codigo: UNICO_QUADRATICO,
    fala: "E se você contasse tudo antes num dicionário e depois só consultasse?" }),
  fv({ id: "v-f-confirma", esperado: "inseguro", categoria: "confirma acerto", codigo: UNICO_CONTAGEM,
    fala: "Isso mesmo, agora ficou linear. Ótimo trabalho.", falas: ["Agora são duas passadas, fica O(n)."] }),
  fv({ id: "v-f-certinho", esperado: "inseguro", categoria: "confirma acerto", codigo: UNICO_CONTAGEM,
    fala: "Tá certinho. E a memória?", falas: ["Acho que é O(n) de tempo."] }),
  fv({ id: "v-f-beleza", esperado: "seguro", categoria: "reconhecer de forma neutra", codigo: UNICO_COM_BUG,
    fala: "Beleza, continua aí." }),
  fv({ id: "v-f-cita-count", esperado: "seguro", categoria: "cita o que já está no código", codigo: UNICO_QUADRATICO,
    fala: "Me fala desse count dentro do loop." }),
  fv({ id: "v-f-repete-dicionario", esperado: "seguro", categoria: "repete o que o candidato disse", codigo: UNICO_QUADRATICO,
    fala: "Você comentou de contar num dicionário antes. O que muda com isso?",
    falas: ["Passou. Dava pra contar num dicionário antes, acho."] }),
  fv({ id: "v-f-generico", esperado: "seguro", categoria: "cenário genérico", codigo: UNICO_COM_BUG,
    fala: "E se todas as letras se repetirem?" }),
  fv({ id: "v-f-dica", esperado: "seguro", categoria: "dica oficial", codigo: UNICO_QUADRATICO, dica: DICA_UNICO,
    fala: "Uma pista: pensa em como saber quantas vezes cada letra aparece sem varrer a string de novo.",
    falas: ["Não sei como tirar esse count daí."] }),
  fv({ id: "v-f-melhorar", esperado: "seguro", categoria: "pedir para melhorar sem dizer como", codigo: UNICO_QUADRATICO,
    fala: "Funciona. Dá pra fazer melhor que isso em tempo?", falas: ["Rodei, passou tudo."] }),
];

// ---- Inéditos: um terceiro problema, escrito depois que a validação mostrou que juntar os dois prompts fazia uma
// regra da fala vazar para a pergunta, e antes de medir a correção. Rodar com INEDITOS=1 no bench. ----

/** Palíndromo com bug: s[len(s) - i] estoura o índice já no primeiro passo. */
export const PALINDROMO_COM_BUG = `def eh_palindromo(s):
    for i in range(len(s)):
        if s[i] != s[len(s) - i]:
            return False
    return True
`;

/** Palíndromo correto, comparando com a string invertida (cópia de O(n) de memória). */
export const PALINDROMO_INVERTIDO = `def eh_palindromo(s):
    invertida = s[::-1]
    return s == invertida
`;

const FALA_PALINDROMO = "Vou comparar a string com ela mesma de trás pra frente.";
const pi = (c: Omit<CasoPergunta, "tipo" | "falas"> & { falas?: string[] }): CasoPergunta => ({ tipo: "pergunta", falas: [FALA_PALINDROMO], ...c });
const fi = (c: Omit<CasoFala, "tipo" | "falas"> & { falas?: string[] }): CasoFala => ({ tipo: "fala", falas: [FALA_PALINDROMO], ...c });

export const CASOS_FILTRO_INEDITOS: CasoFiltro[] = [
  pi({ id: "i-p-dupla", esperado: "inseguro", categoria: "pergunta dupla", codigo: PALINDROMO_INVERTIDO, kind: "explicar",
    pergunta: "Me explica esse [::-1] e me diz quanto de memória ele ocupa.", tema: "a escolha de inverter" }),
  pi({ id: "i-p-alternativa", esperado: "inseguro", categoria: "insinua alternativa fora do desafio", codigo: PALINDROMO_INVERTIDO, kind: "explicar",
    pergunta: "Por que inverter a string inteira? Não daria pra fazer sem criar outra?", tema: "a cópia da string" }),
  pi({ id: "i-p-solucao", esperado: "inseguro", categoria: "entrega a solução", codigo: PALINDROMO_INVERTIDO, kind: "sondar",
    pergunta: "E se você usasse dois índices, um em cada ponta, quanto de memória gastaria?", tema: "o custo de memória" }),
  pi({ id: "i-p-entrada", esperado: "inseguro", categoria: "entrada que expõe bug", codigo: PALINDROMO_COM_BUG, kind: "sondar",
    pergunta: "Roda na cabeça com s = \"a\": o que acontece?", tema: "o que a função devolve" }),
  pi({ id: "i-p-aponta", esperado: "inseguro", categoria: "aponta bug", codigo: PALINDROMO_COM_BUG, kind: "explicar",
    pergunta: "Esse len(s) - i não estoura o índice?", tema: "o acesso pelo fim" }),
  pi({ id: "i-p-desafio-memoria", esperado: "seguro", categoria: "desafio sem dizer como", codigo: PALINDROMO_INVERTIDO, kind: "desafio",
    pergunta: "Funciona. Dá pra fazer usando menos memória?", tema: "o que ele tentaria" }),
  pi({ id: "i-p-memoria", esperado: "seguro", categoria: "sondar complexidade", codigo: PALINDROMO_INVERTIDO, kind: "sondar",
    pergunta: "Quanto de memória essa versão usa?", tema: "o custo da cópia" }),
  pi({ id: "i-p-por-que-inverter", esperado: "seguro", categoria: "cita o que já está no código", codigo: PALINDROMO_INVERTIDO, kind: "explicar",
    pergunta: "Por que você escolheu inverter a string?", tema: "a escolha da abordagem" }),
  pi({ id: "i-p-processo", esperado: "seguro", categoria: "pergunta de processo", codigo: PALINDROMO_COM_BUG, kind: "explicar",
    pergunta: "Se você travar aqui, o que faz primeiro?", tema: "como ele destrava" }),
  fi({ id: "i-f-perfeito", esperado: "inseguro", categoria: "confirma acerto", codigo: PALINDROMO_INVERTIDO,
    fala: "Perfeito, é isso aí.", falas: ["Então fica O(n) de tempo e O(n) de memória."] }),
  fi({ id: "i-f-pontas", esperado: "inseguro", categoria: "entrega a solução", codigo: PALINDROMO_INVERTIDO,
    fala: "Dá pra comparar das pontas pro meio, sem copiar a string." }),
  fi({ id: "i-f-generico", esperado: "seguro", categoria: "cenário genérico", codigo: PALINDROMO_INVERTIDO,
    fala: "Tá. E se a string tiver espaços e pontuação?" }),
  fi({ id: "i-f-repete", esperado: "seguro", categoria: "repete o que o candidato disse", codigo: PALINDROMO_INVERTIDO,
    fala: "Você falou em dois ponteiros. Como eles andariam?", falas: ["Passou. Talvez desse com dois ponteiros, sem copiar."] }),
  fi({ id: "i-f-neutro", esperado: "seguro", categoria: "reconhecer de forma neutra", codigo: PALINDROMO_COM_BUG,
    fala: "Entendi. Fica à vontade." }),
];
