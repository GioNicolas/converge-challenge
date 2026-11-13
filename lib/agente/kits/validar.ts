/**
 * Validação determinística de um kit gerado (ou editado por uma pessoa): Zod + regras de negócio.
 * Não chama LLM. Devolve TODAS as violações de uma vez (alimentam o retry da geração e o PUT).
 */
import { Kit, palavrasSemAcento, type Empecilho, type Problema, semAcento } from "./tipos";

export const MIN_CRITERIOS = 6;
export const MIN_FICHA = 8;
export const MIN_SINAIS = 4;
export const MIN_ARMADILHAS = 3;
export const MIN_PERGUNTAS = 3;
export const MIN_TIPOS_PERGUNTA = 4;
export const MAX_ENUNCIADO = 500;
/** Alvo do prompt: 2 frases e ~220 caracteres (12 s de voz); 300 é a folga. Os problemas FIXOS do catálogo têm falas maiores e não passam por este validador. */
export const MAX_FALA_DO_DESAFIO = 300;
/** Teto ao EDITAR uma avaliação já salva: questões gravadas antes do teto de 300 podem ter até 600 e não podem travar a edição. */
export const MAX_FALA_DO_DESAFIO_EDICAO = 600;

/**
 * `edicao: true` = validação de uma avaliação que uma pessoa edita (rota PUT): teto da fala em 600 e sem as
 * checagens de coerência do texto (título x enunciado, concordância), para não travar questões já salvas.
 * Sem a opção = problema recém-gerado: teto de 300 e todas as checagens.
 */
export type OpcoesValidacao = {
  edicao?: boolean;
  /** Pula só as checagens de coerência do texto (título, concordância): serve para aceitar, na última tentativa da geração, o problema que só falha nelas. */
  semCoerencia?: boolean;
};

/** Id seguro para URL, log e chave de mapa: minúsculas, dígitos e "_", começando por letra. */
export const RE_SLUG = /^[a-z][a-z0-9_]{1,63}$/;
export const eSlugSeguro = (s: string): boolean =>
  RE_SLUG.test(s) && !["__proto__", "constructor", "prototype"].includes(s);

/** "backend-pleno" -> "backend_pleno". Devolve um slug seguro mesmo para entradas estranhas. */
export function paraSlug(texto: string, prefixo = "k"): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const s = /^[a-z]/.test(base) ? base : `${prefixo}_${base}`;
  return eSlugSeguro(s) ? s : `${prefixo}_${Date.now().toString(36)}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const vazio = (s: string) => s.trim().length === 0;

/** Números "de verdade" (2+ dígitos ou decimais) que aparecem num texto, sem separador de milhar. */
function numerosDe(texto: string): Set<string> {
  const out = new Set<string>();
  for (const m of texto.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = m[0].replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    if (n.length >= 2 || n.includes(".")) out.add(n);
  }
  return out;
}

export type ResultadoValidacao = { ok: true; kit: Kit; avisos: string[] } | { ok: false; erros: string[] };

export function validarKit(bruto: unknown, opcoes: OpcoesValidacao = {}): ResultadoValidacao {
  const z = Kit.safeParse(bruto);
  if (!z.success) {
    return {
      ok: false,
      erros: z.error.issues.slice(0, 20).map((i) => `schema: ${i.path.join(".") || "(raiz)"}: ${i.message}`),
    };
  }
  // `provaSoPorFala` está fora do schema (o Zod o descarta): devolve o booleano do critério de entrada.
  const soPorFala = new Map<string, boolean>();
  const criteriosBrutos = (bruto as { criterios?: unknown }).criterios;
  if (Array.isArray(criteriosBrutos)) {
    for (const c of criteriosBrutos) {
      const { id, provaSoPorFala } = (c ?? {}) as { id?: unknown; provaSoPorFala?: unknown };
      if (typeof id === "string" && typeof provaSoPorFala === "boolean") soPorFala.set(id, provaSoPorFala);
    }
  }
  const kit: Kit = {
    ...z.data,
    criterios: z.data.criterios.map((c) => (soPorFala.has(c.id) ? { ...c, provaSoPorFala: soPorFala.get(c.id) } : c)),
  };
  const erros: string[] = [];
  const avisos: string[] = [];

  // `empecilho` do problema também está fora do schema (o Zod o descarta). Volta do bruto, se passar nas regras:
  // assim um PUT que edita a questão não apaga a mudança. Inválido sai do kit e vira aviso.
  const problemaBruto = (bruto as { problemas?: { id?: unknown; empecilho?: unknown }[] }).problemas?.[0];
  if (kit.problemas[0] && problemaBruto?.empecilho !== undefined) {
    const emp = empecilhoDeEntrada(problemaBruto.empecilho, typeof problemaBruto.id === "string" ? problemaBruto.id : kit.problemas[0].id);
    if (emp) kit.problemas[0] = { ...kit.problemas[0], empecilho: emp };
    else avisos.push("empecilho do problema descartado: não passa nas regras (fala com pergunta, requisito até 50 caracteres)");
  }

  if (!eSlugSeguro(kit.id)) erros.push(`kit.id "${kit.id}" não é um slug seguro (a-z, 0-9, _; começa por letra)`);
  for (const campo of ["area", "persona", "tipoEntrevista"] as const) {
    if (vazio(kit[campo])) erros.push(`${campo} vazio`);
  }

  // Rubrica
  if (kit.criterios.length < MIN_CRITERIOS) {
    erros.push(`rubrica com ${kit.criterios.length} critérios; o mínimo é ${MIN_CRITERIOS} (4 universais + 2 a 3 da área)`);
  }
  if (kit.criterios.length > 8) avisos.push(`rubrica com ${kit.criterios.length} critérios (esperado 6 a 7)`);
  const ids = new Set<string>();
  for (const c of kit.criterios) {
    if (!eSlugSeguro(c.id)) erros.push(`critério "${c.id}": id não é slug seguro`);
    if (ids.has(c.id)) erros.push(`critério "${c.id}": id duplicado`);
    ids.add(c.id);
    if (vazio(c.nome)) erros.push(`critério "${c.id}": nome vazio`);
    const niveis = ([1, 2, 3, 4] as const).map((n) => c.niveis[n]);
    niveis.forEach((t, i) => {
      if (vazio(t)) erros.push(`critério "${c.id}": nível ${i + 1} vazio`);
    });
    if (new Set(niveis.map(norm)).size < 4) erros.push(`critério "${c.id}": os 4 níveis precisam ser distintos`);
  }

  // Problema
  if (kit.problemas.length !== 1) erros.push(`o kit deve ter exatamente 1 problema (veio ${kit.problemas.length})`);
  if (kit.problemas[0]) erros.push(...errosDoProblema(kit.problemas[0], opcoes));

  if (kit.tiposPergunta.length < MIN_TIPOS_PERGUNTA) {
    erros.push(`tiposPergunta com ${kit.tiposPergunta.length}; o mínimo é ${MIN_TIPOS_PERGUNTA}`);
  }
  kit.tiposPergunta.forEach((t, i) => {
    if (vazio(t.nome) || vazio(t.exemplo) || vazio(t.revela)) erros.push(`tiposPergunta[${i}]: campos vazios`);
  });
  if (kit.termosTranscricao.length < 5) avisos.push("poucos termosTranscricao (<5): o STT errará o vocabulário da área");
  if (kit.termosTranscricao.some(vazio)) erros.push("termosTranscricao tem item vazio");

  return erros.length ? { ok: false, erros } : { ok: true, kit, avisos };
}

/** Regras do problema (o que a questão gerada para a vaga precisa cumprir sozinha, sem o resto do kit). */
export function errosDoProblema(p: Problema, opcoes: OpcoesValidacao = {}): string[] {
  const maxFala = opcoes.edicao ? MAX_FALA_DO_DESAFIO_EDICAO : MAX_FALA_DO_DESAFIO;
  const erros: string[] = [];
  if (!eSlugSeguro(p.id)) erros.push(`problema.id "${p.id}" não é slug seguro`);
  if (vazio(p.titulo)) erros.push("problema.titulo vazio");
  if (vazio(p.enunciado)) erros.push("problema.enunciado vazio");
  if (p.enunciado.length > MAX_ENUNCIADO) {
    erros.push(`enunciado com ${p.enunciado.length} caracteres; o máximo é ${MAX_ENUNCIADO}`);
  }
  if (p.ficha.length < MIN_FICHA) erros.push(`ficha com ${p.ficha.length} linhas; o mínimo é ${MIN_FICHA}`);
  p.ficha.forEach((f, i) => {
    if (vazio(f.pergunta) || vazio(f.resposta)) erros.push(`ficha[${i}]: pergunta e resposta precisam ter texto`);
  });
  if (p.sinaisEsperados.length < MIN_SINAIS) erros.push(`sinaisEsperados com ${p.sinaisEsperados.length}; o mínimo é ${MIN_SINAIS}`);
  if (p.armadilhas.length < MIN_ARMADILHAS) erros.push(`armadilhas com ${p.armadilhas.length}; o mínimo é ${MIN_ARMADILHAS}`);
  if (p.perguntasSugeridas.length < MIN_PERGUNTAS) erros.push(`perguntasSugeridas com ${p.perguntasSugeridas.length}; o mínimo é ${MIN_PERGUNTAS}`);
  for (const [campo, lista] of [
    ["sinaisEsperados", p.sinaisEsperados],
    ["armadilhas", p.armadilhas],
    ["perguntasSugeridas", p.perguntasSugeridas],
  ] as const) {
    if (lista.some(vazio)) erros.push(`${campo} tem item vazio`);
  }

  // O enunciado é público (vai ao navegador): não pode entregar números da ficha.
  const numerosFicha = numerosDe(p.ficha.map((f) => f.resposta).join(" "));
  const vazados = [...numerosDe(p.enunciado)].filter((n) => numerosFicha.has(n));
  if (vazados.length) {
    erros.push(`enunciado vaza números da ficha (${vazados.join(", ")}); o enunciado deve ser vago de propósito`);
  }
  // A fala do desafio também é pública (o agente a fala no início): mesmas regras do enunciado.
  if (p.falaDoDesafio !== undefined) {
    if (p.falaDoDesafio.length > maxFala) {
      erros.push(`falaDoDesafio com ${p.falaDoDesafio.length} caracteres; o máximo é ${maxFala}`);
    }
    const vazadosFala = [...numerosDe(p.falaDoDesafio)].filter((n) => numerosFicha.has(n));
    if (vazadosFala.length) {
      erros.push(`falaDoDesafio vaza números da ficha (${vazadosFala.join(", ")})`);
    }
  }
  if (!opcoes.edicao && !opcoes.semCoerencia) erros.push(...errosDeCoerencia(p));
  return erros;
}

// Coerência do texto (sem modelo): título x enunciado e concordância de gênero. Sem regex.

/** Palavras que não dizem de que o sistema trata (nem o título nem o enunciado se distinguem por elas). */
const PALAVRAS_VAZIAS = new Set([
  "para", "como", "com", "sem", "mais", "menos", "sobre", "entre", "cada", "todo", "toda", "todos", "todas",
  "seus", "suas", "meus", "minhas", "esse", "essa", "esses", "essas", "este", "esta", "estes", "estas",
  "isso", "aquele", "aquela", "aquilo", "pela", "pelo", "pelas", "pelos", "quando", "onde", "quem",
  "qual", "quais", "muito", "muita", "muitos", "muitas", "pouco", "pouca", "poucos", "poucas", "tambem",
  "desde", "apos", "ainda", "tudo", "nada", "outro", "outra", "outros", "outras", "mesmo", "mesma",
  "sistema", "sistemas", "plataforma", "plataformas", "real", "tempo", "painel", "paineis", "app", "apps",
  "aplicativo", "aplicativos", "servico", "servicos", "solucao", "desenhe", "desenho", "projete", "projeto",
  "crie", "monte", "arquitetura", "dados", "ferramenta", "ferramentas", "modulo", "novo", "nova",
  "grande", "grandes", "forma", "parte", "partes", "tipo", "tipos", "ponto", "pontos", "empresa", "equipe",
]);

/** Mesma palavra, comparando até 5 letras ("pedido" = "pedidos", "entrega" = "entregas"). */
const mesmoRadical = (a: string, b: string): boolean => {
  const k = Math.min(5, a.length, b.length);
  return (k >= 4 || (k >= 2 && a.length === b.length)) && a.slice(0, k) === b.slice(0, k);
};

/** Siglas de 2 a 4 letras escritas em maiúsculas no texto original ("URL", "API", "SMS"), em minúsculas. */
function siglasDe(texto: string): string[] {
  const out: string[] = [];
  let atual = "";
  const fechar = () => {
    if (atual.length >= 2 && atual.length <= 4) out.push(atual.toLowerCase());
    atual = "";
  };
  for (const ch of texto) {
    if (ch >= "A" && ch <= "Z") atual += ch;
    else fechar();
  }
  fechar();
  return out;
}

/** Palavras de conteúdo de um texto: sem acento, 4 letras ou mais (ou sigla em maiúsculas), fora da lista de palavras vazias; sem repetir. */
function palavrasDeConteudo(texto: string): string[] {
  return [...new Set([...palavrasSemAcento(texto).filter((w) => w.length >= 4 && !PALAVRAS_VAZIAS.has(w)), ...siglasDe(texto)])];
}

const citar = (ws: string[]) => ws.slice(0, 3).map((w) => `"${w}"`).join(", ");

/** O título precisa compartilhar uma palavra de conteúdo com o enunciado ou com a primeira linha da ficha. */
export function errosDoTitulo(p: Problema): string[] {
  const doTitulo = palavrasDeConteudo(p.titulo);
  if (!doTitulo.length) return [];
  const primeira = p.ficha[0] ? `${p.ficha[0].pergunta} ${p.ficha[0].resposta}` : "";
  const dele = palavrasDeConteudo(`${p.enunciado} ${primeira}`);
  if (doTitulo.some((t) => dele.some((e) => mesmoRadical(t, e)))) return [];
  return [
    `o título fala de ${citar(doTitulo)}; o enunciado, de ${citar(palavrasDeConteudo(p.enunciado))}. ` +
      "O título deve nomear o sistema que o enunciado descreve, com as mesmas palavras-chave",
  ];
}

/** Determinantes e possessivos (minúsculos, com acento). "a" sozinho fica fora do feminino ("a pedido de"). */
const FEMININO = new Set([
  "as", "às", "à", "da", "das", "na", "nas", "pela", "pelas", "sua", "suas", "minha", "minhas", "própria", "próprias",
  "essa", "essas", "esta", "estas", "aquela", "aquelas", "toda", "todas", "muita", "muitas", "pouca", "poucas",
  "uma", "umas", "quantas", "outra", "outras", "algumas",
]);
const MASCULINO = new Set([
  "o", "os", "do", "dos", "no", "nos", "pelo", "pelos", "ao", "aos", "seu", "seus", "meu", "meus", "próprio", "próprios",
  "esse", "esses", "este", "estes", "aquele", "aqueles", "todo", "todos", "muito", "muitos", "pouco", "poucos",
  "um", "uns", "quantos", "outro", "outros", "alguns",
]);

/** Palavras (só letras, minúsculas, COM acento) de um texto. */
function palavrasComAcento(texto: string): string[] {
  const out: string[] = [];
  let atual = "";
  for (const ch of texto.toLowerCase()) {
    if (ch.toLowerCase() !== ch.toUpperCase()) atual += ch;
    else if (atual) {
      out.push(atual);
      atual = "";
    }
  }
  if (atual) out.push(atual);
  return out;
}

/**
 * Concordância de gênero barata: uma palavra que o MESMO problema usa depois de um determinante masculino
 * ("os pedidos") e depois de um feminino ("suas pedidos") está errada em um dos dois (erro típico do gerador ao
 * trocar uma palavra sem ajustar o artigo). Só olha palavras terminadas em a/o (com s), para não acusar
 * substantivos de dois gêneros ("os clientes", "as clientes"). Um campo por vez: não pareia entre campos.
 */
export function errosDeConcordancia(p: Problema): string[] {
  const campos = [p.titulo, p.enunciado, p.falaDoDesafio ?? "", ...p.ficha.flatMap((f) => [f.pergunta, f.resposta])];
  const fem = new Map<string, string>(); // radical -> primeiro "determinante palavra" visto no feminino
  const masc = new Map<string, string>();
  for (const campo of campos) {
    const ws = palavrasComAcento(campo);
    for (let i = 0; i + 1 < ws.length; i++) {
      const det = ws[i];
      const prox = ws[i + 1];
      const eFem = FEMININO.has(det);
      if (!eFem && !MASCULINO.has(det)) continue;
      if (FEMININO.has(prox) || MASCULINO.has(prox)) continue;
      const n = semAcento(prox);
      if (n.length < 4 || n.endsWith("ista") || n.endsWith("istas")) continue;
      const radical = n.endsWith("s") ? n.slice(0, -1) : n;
      if (!radical.endsWith("a") && !radical.endsWith("o")) continue;
      const alvo = eFem ? fem : masc;
      if (!alvo.has(radical)) alvo.set(radical, `${det} ${prox}`);
    }
  }
  const erros: string[] = [];
  for (const [radical, comFem] of fem) {
    const comMasc = masc.get(radical);
    if (comMasc) {
      erros.push(`concordância de gênero: "${comFem}" (feminino) e "${comMasc}" (masculino) usam a mesma palavra; corrija o artigo ou o possessivo`);
    }
  }
  return erros;
}

/** Checagens de coerência do texto de um problema GERADO (ver `OpcoesValidacao`). */
export function errosDeCoerencia(p: Problema): string[] {
  return [...errosDoTitulo(p), ...errosDeConcordancia(p)];
}

// Mudança no problema (empecilho) criada pelo gerador da questão da vaga.

export const TIPOS_EMPECILHO = ["requisito_muda", "restricao_nova", "parte_cai"] as const;
/** A fala da mudança segue o teto da fala do desafio (2 frases, com folga). */
export const MAX_FALA_DO_EMPECILHO = MAX_FALA_DO_DESAFIO;
export const MAX_REQUISITO_DO_EMPECILHO = 50;

/** Id da mudança de um problema gerado (o modelo não escolhe ids: o código dá o id a partir do problema). */
export const idEmpecilhoDoProblema = (problemaId: string): string => `mudanca_${problemaId}`;

/** O que o modelo escreve para a mudança (sem id). */
export type EmpecilhoBruto = { tipo: string; fala: string; requisito: string; exige: string };

/**
 * Regras da mudança gerada: tipo do enum, fala não vazia, dentro do teto e terminando em pergunta (a bola fica com
 * o candidato), requisito de 1 a 50 caracteres e `exige` preenchido. Função pura. Vazio = válida.
 */
export function errosDoEmpecilho(e: EmpecilhoBruto): string[] {
  const erros: string[] = [];
  if (!(TIPOS_EMPECILHO as readonly string[]).includes(e.tipo)) erros.push(`empecilho.tipo "${e.tipo}" não existe`);
  if (vazio(e.fala)) erros.push("empecilho.fala vazia");
  else {
    if (e.fala.trim().length > MAX_FALA_DO_EMPECILHO) erros.push(`empecilho.fala com ${e.fala.trim().length} caracteres; o máximo é ${MAX_FALA_DO_EMPECILHO}`);
    if (!e.fala.trim().endsWith("?")) erros.push("empecilho.fala deve terminar em pergunta (a bola fica com o candidato)");
  }
  const requisito = e.requisito.trim().length;
  if (requisito === 0) erros.push("empecilho.requisito vazio");
  else if (requisito > MAX_REQUISITO_DO_EMPECILHO) erros.push(`empecilho.requisito com ${requisito} caracteres; o máximo é ${MAX_REQUISITO_DO_EMPECILHO}`);
  if (vazio(e.exige)) erros.push("empecilho.exige vazio");
  return erros;
}

/**
 * A mudança que o gerador devolveu, pronta para o problema (com o id dado pelo código), ou undefined quando falha
 * em alguma regra. Inválida = descartada: o problema segue sem ela e a rota usa uma genérica do kit.
 */
export function empecilhoGerado(bruto: EmpecilhoBruto | undefined | null, id: string): Empecilho | undefined {
  if (!bruto || errosDoEmpecilho(bruto).length) return undefined;
  return {
    id,
    tipo: bruto.tipo as Empecilho["tipo"],
    fala: bruto.fala.trim(),
    requisito: bruto.requisito.trim(),
    exige: bruto.exige.trim(),
  };
}

/** Mudança vinda de um kit salvo (bruto, sem garantia de tipos): só vale se os quatro campos são texto e passam nas regras. */
function empecilhoDeEntrada(entrada: unknown, problemaId: string): Empecilho | undefined {
  if (!entrada || typeof entrada !== "object") return undefined;
  const { id, tipo, fala, requisito, exige } = entrada as Record<string, unknown>;
  if ([tipo, fala, requisito, exige].some((v) => typeof v !== "string")) return undefined;
  const bruto = { tipo, fala, requisito, exige } as EmpecilhoBruto;
  return empecilhoGerado(bruto, typeof id === "string" && eSlugSeguro(id) ? id : idEmpecilhoDoProblema(problemaId));
}
