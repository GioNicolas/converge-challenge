/**
 * Revisão do problema gerado: uma chamada ao modelo DEPOIS da geração e do validador, que corrige português,
 * alinha o título ao enunciado e encurta a fala do desafio. O modelo só propõe; quem decide são guardas
 * determinísticas (funções puras abaixo): os números de todos os campos têm de ficar idênticos, a ficha mantém
 * o número de linhas, e o resultado tem de passar de novo no validador. Qualquer falha (modelo, prazo, schema,
 * guarda) deixa o texto original: a revisão nunca bloqueia a criação da vaga nem gera erro para quem chama.
 */
import { z } from "zod";
import { ErroLlm, type LlmCliente } from "../llm/cliente";
import { ALVO_FALA_DO_DESAFIO, montarMensagemRevisao, NOME_SCHEMA_REVISAO, SISTEMA_REVISOR_PROBLEMA } from "../prompts/revisor-problema";
import type { Problema } from "./tipos";
import { errosDoProblema } from "./validar";

/** O que o modelo devolve. */
export const RevisaoDoProblema = z.object({
  /** O que ele achou de errado (vazio se nada). Só informativo: vai para o log e para o script de auditoria. */
  problemas: z.array(z.string()),
  titulo: z.string(),
  enunciado: z.string(),
  falaDoDesafio: z.string(),
  ficha: z.array(z.object({ pergunta: z.string(), resposta: z.string() })),
});
export type RevisaoDoProblema = z.infer<typeof RevisaoDoProblema>;

/** Prazo da chamada de revisão: curta, e quem espera a questão não pode esperar mais que isso por ela. */
export const TIMEOUT_REVISAO_MS = 40_000;
const MAX_TOKENS_REVISAO = 3000;

export type ResultadoRevisao = {
  /** O problema que vale: o revisado, ou o original quando a revisão foi descartada. */
  problema: Problema;
  /** A revisão foi aceita pelas guardas (pode não ter mudado nada: ver `mudou`). */
  aceita: boolean;
  /** O texto de algum campo mudou. */
  mudou: boolean;
  /** O que o modelo achou de errado (mesmo se a revisão foi descartada). */
  problemas: string[];
  /** Por que a revisão foi descartada (guarda, modelo, prazo). Vazio quando aceita. */
  descartada?: string;
  modelo?: string;
  ms: number;
};

/** Todos os números (qualquer quantidade de dígitos, com separador) de um texto, ordenados. */
export function numerosDoTexto(texto: string): string[] {
  return [...texto.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0]).sort();
}

/** Os campos de texto de um problema, cada um com uma etiqueta (para dizer onde um número mudou). */
function camposDeTexto(p: Problema): [string, string][] {
  return [
    ["titulo", p.titulo],
    ["enunciado", p.enunciado],
    ["falaDoDesafio", p.falaDoDesafio ?? ""],
    ...p.ficha.flatMap((f, i): [string, string][] => [
      [`ficha[${i}].pergunta`, f.pergunta],
      [`ficha[${i}].resposta`, f.resposta],
    ]),
    ...p.sinaisEsperados.map((s, i): [string, string] => [`sinaisEsperados[${i}]`, s]),
    ...p.armadilhas.map((s, i): [string, string] => [`armadilhas[${i}]`, s]),
    ...p.perguntasSugeridas.map((s, i): [string, string] => [`perguntasSugeridas[${i}]`, s]),
  ];
}

/**
 * Campos em que os números do problema `depois` diferem dos de `antes` (mesmos números, em qualquer ordem, no
 * mesmo campo). Lista vazia = idênticos. Função pura: é a guarda que impede a revisão de mexer em conteúdo.
 */
export function camposComNumeroAlterado(antes: Problema, depois: Problema): string[] {
  const a = new Map(camposDeTexto(antes));
  const b = new Map(camposDeTexto(depois));
  const rotulos = new Set([...a.keys(), ...b.keys()]);
  return [...rotulos].filter(
    (r) => JSON.stringify(numerosDoTexto(a.get(r) ?? "")) !== JSON.stringify(numerosDoTexto(b.get(r) ?? "")),
  );
}

/** Junta a revisão ao original: só título, enunciado, fala e ficha mudam; o resto (e o id) é do original. */
export function mesclarRevisao(original: Problema, r: RevisaoDoProblema): Problema {
  return {
    ...original,
    titulo: r.titulo.trim(),
    enunciado: r.enunciado.trim(),
    // Sem fala no original, a revisão não cria uma (o quadro tem a sua própria fala de reserva).
    ...(original.falaDoDesafio === undefined ? {} : { falaDoDesafio: r.falaDoDesafio.trim() }),
    ficha: r.ficha.map((f) => ({ pergunta: f.pergunta.trim(), resposta: f.resposta.trim() })),
  };
}

const mudou = (a: Problema, b: Problema): boolean => JSON.stringify(camposDeTexto(a)) !== JSON.stringify(camposDeTexto(b));

/**
 * Aplica a revisão ao problema se ela passar em todas as guardas; senão devolve o motivo. Função pura.
 *  1. a ficha tem o mesmo número de linhas;
 *  2. os números de todos os campos são idênticos aos do original;
 *  3. o resultado passa no validador (tamanhos, campos vazios, vazamento de número da ficha);
 */
export function aplicarRevisao(original: Problema, r: RevisaoDoProblema): { ok: true; problema: Problema; mudou: boolean } | { ok: false; motivo: string } {
  if (r.ficha.length !== original.ficha.length) {
    return { ok: false, motivo: `a ficha mudou de ${original.ficha.length} para ${r.ficha.length} linhas` };
  }
  const novo = mesclarRevisao(original, r);
  const numeros = camposComNumeroAlterado(original, novo);
  if (numeros.length) return { ok: false, motivo: `número alterado em ${numeros.slice(0, 5).join(", ")}` };
  const erros = errosDoProblema(novo);
  if (erros.length) return { ok: false, motivo: `reprovada no validador: ${erros.slice(0, 3).join("; ")}` };
  return { ok: true, problema: novo, mudou: mudou(original, novo) };
}

/** Frases de um texto falado (corta em . ! ? seguidos de espaço). */
export function contarFrases(texto: string): number {
  return texto.split(/(?<=[.!?])\s+/).filter((f) => f.trim()).length;
}

/** Por que a fala está acima do alvo (2 frases, ~220 caracteres), ou undefined se está dentro. Função pura. */
export function foraDoAlvoDaFala(fala: string | undefined): string | undefined {
  if (!fala) return undefined;
  const frases = contarFrases(fala);
  const partes = [
    frases > 2 ? `tem ${frases} frases (o máximo é 2)` : "",
    fala.length > ALVO_FALA_DO_DESAFIO ? `tem ${fala.length} caracteres (o alvo é no máximo ${ALVO_FALA_DO_DESAFIO})` : "",
  ].filter(Boolean);
  return partes.length ? `a fala ${partes.join(" e ")}` : undefined;
}

/**
 * Revisa o problema com o modelo. Nunca lança: em qualquer falha devolve o original com `descartada` explicando.
 * `llm` é o cliente do cérebro (o `lib/llm` escolhe o modelo do papel: processamento de fundo, Featherless primeiro).
 * Se a revisão aceita deixa a fala acima do alvo (modelos pequenos ignoram o limite), pede UMA vez de novo.
 */
export async function revisarProblema(
  original: Problema,
  llm: LlmCliente,
  opcoes: { timeoutMs?: number; sinal?: AbortSignal } = {},
): Promise<ResultadoRevisao> {
  const inicio = Date.now();
  const base = { problema: original, aceita: false, mudou: false, problemas: [] as string[] };
  const mensagens: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: montarMensagemRevisao(original) }];
  const chamar = () =>
    llm.completarJson({
      sistema: { estatico: SISTEMA_REVISOR_PROBLEMA },
      mensagens,
      schema: RevisaoDoProblema,
      nomeSchema: NOME_SCHEMA_REVISAO,
      maxTokens: MAX_TOKENS_REVISAO,
      timeoutMs: opcoes.timeoutMs ?? TIMEOUT_REVISAO_MS,
      sinal: opcoes.sinal,
    });
  try {
    let r = await chamar();
    let problemas = r.dados.problemas.map((p) => p.trim()).filter(Boolean).slice(0, 10);
    let ap = aplicarRevisao(original, r.dados);
    const excesso = ap.ok ? foraDoAlvoDaFala(ap.problema.falaDoDesafio) : undefined;
    if (ap.ok && excesso) {
      mensagens.push(
        { role: "assistant", content: JSON.stringify(r.dados) },
        { role: "user", content: `${excesso}. Reescreva SÓ a fala em no máximo 2 frases e ${ALVO_FALA_DO_DESAFIO} caracteres (tema + convite curto) e devolva o JSON completo de novo, com os outros campos como estão.` },
      );
      try {
        const r2 = await chamar();
        const ap2 = aplicarRevisao(original, r2.dados);
        // Só vale a segunda se passa nas guardas (senão fica a primeira, que já era aceitável).
        if (ap2.ok) {
          r = r2;
          ap = ap2;
          problemas = [...new Set([...problemas, ...r2.dados.problemas.map((p) => p.trim()).filter(Boolean)])].slice(0, 10);
        }
      } catch {
        // a primeira revisão continua valendo
      }
    }
    const ms = Date.now() - inicio;
    if (!ap.ok) return { ...base, problemas, descartada: ap.motivo, modelo: r.modelo, ms };
    return { problema: ap.problema, aceita: true, mudou: ap.mudou, problemas, modelo: r.modelo, ms };
  } catch (e) {
    const motivo = e instanceof ErroLlm ? `modelo: ${e.codigo}` : `erro: ${e instanceof Error ? e.message : String(e)}`;
    return { ...base, descartada: motivo.slice(0, 200), ms: Date.now() - inicio };
  }
}
