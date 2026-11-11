/**
 * Validação determinística de um kit gerado (ou editado por uma pessoa): Zod + regras de negócio.
 * Não chama LLM. Devolve TODAS as violações de uma vez (alimentam o retry da geração e o PUT).
 */
import { Kit, type Problema } from "./tipos";

export const MIN_CRITERIOS = 6;
export const MIN_FICHA = 8;
export const MIN_SINAIS = 4;
export const MIN_ARMADILHAS = 3;
export const MIN_PERGUNTAS = 3;
export const MIN_TIPOS_PERGUNTA = 4;
export const MAX_ENUNCIADO = 500;
/** Alvo do prompt: 2 frases e ~220 caracteres (12 s de voz); 300 é a folga. Os problemas FIXOS do catálogo têm falas maiores e não passam por este validador. */
export const MAX_FALA_DO_DESAFIO = 300;

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

export function validarKit(bruto: unknown): ResultadoValidacao {
  const z = Kit.safeParse(bruto);
  if (!z.success) {
    return {
      ok: false,
      erros: z.error.issues.slice(0, 20).map((i) => `schema: ${i.path.join(".") || "(raiz)"}: ${i.message}`),
    };
  }
  const kit = z.data;
  const erros: string[] = [];
  const avisos: string[] = [];

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
  if (kit.problemas[0]) erros.push(...errosDoProblema(kit.problemas[0]));

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
export function errosDoProblema(p: Problema): string[] {
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
    if (p.falaDoDesafio.length > MAX_FALA_DO_DESAFIO) {
      erros.push(`falaDoDesafio com ${p.falaDoDesafio.length} caracteres; o máximo é ${MAX_FALA_DO_DESAFIO}`);
    }
    const vazadosFala = [...numerosDe(p.falaDoDesafio)].filter((n) => numerosFicha.has(n));
    if (vazadosFala.length) {
      erros.push(`falaDoDesafio vaza números da ficha (${vazadosFala.join(", ")})`);
    }
  }
  return erros;
}
