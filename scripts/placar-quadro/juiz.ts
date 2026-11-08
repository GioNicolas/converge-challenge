// Juiz do placar: um modelo forte lê a conversa e dá nota a cada fala do Totti (e à entrevista inteira).
// Mede o que as regex não pegam: se ele ouviu, se a pergunta valia a pena, se soou como gente.
// Ainda não calibrado com notas humanas: use para comparar versões entre si, não como verdade absoluta.
import { z } from "zod";
import { chatJsonVia } from "../../lib/llm/openaiCompat";
import { featherless } from "../../lib/llm/featherless";
import { openrouter } from "../../lib/llm/openrouter";
import { kit, problema } from "./casos";
import type { Conversa } from "./simulacao";

/**
 * Juiz e candidato rodam na Featherless por padrão (assinatura, sem custo por token); PLACAR_PROVEDOR=openrouter
 * volta para os modelos pagos. O Totti em si usa os provedores de produção, como sempre.
 */
const featherlessDoPlacar = {
  ...featherless,
  // Chave própria (PLACAR_FEATHERLESS_API_KEY), para não disputar a concorrência com a do produto.
  apiKeyEnv: process.env.PLACAR_FEATHERLESS_API_KEY ? "PLACAR_FEATHERLESS_API_KEY" : featherless.apiKeyEnv,
  concurrency: Number(process.env.PLACAR_FEATHERLESS_CONCURRENCY) || 2,
};
export const PROVEDOR_PLACAR = process.env.PLACAR_PROVEDOR === "openrouter" ? openrouter : featherlessDoPlacar;
export const MODELO_JUIZ =
  process.env.PLACAR_MODELO_JUIZ || (PROVEDOR_PLACAR === openrouter ? "anthropic/claude-sonnet-5.5" : "moonshotai/Kimi-K2.6");

export const VIOLACOES = [
  "validou",
  "ensinou_ou_deu_dica",
  "vazou_criterio",
  "inventou_fato",
  "repetiu_pergunta",
  "insistiu_apos_nao_sei",
  "ignorou_o_que_ele_disse",
  "mais_de_uma_pergunta",
  "falou_id_interno",
  "robotico_ou_enlatado",
  "interrompeu_quem_pensava",
  "ficou_quieto_quando_devia_falar",
  "fala_longa_para_voz",
] as const;

const Nota = z.number().int().min(1).max(5);
const EsquemaFala = z.object({
  n: z.number().int(),
  escuta: Nota,
  pertinencia: Nota,
  naturalidade: Nota,
  concisao: Nota,
  violacoes: z.array(z.enum(VIOLACOES)),
  comentario: z.string(),
});
export type NotaFala = z.infer<typeof EsquemaFala>;

const EsquemaConversa = z.object({
  falas: z.array(EsquemaFala),
  geral: z.object({
    pareceu_pessoa: Nota,
    conduziu_bem: Nota,
    inteligencia: Nota,
    resumo: z.string(),
    piores_momentos: z.array(z.object({ n: z.number().int(), problema: z.string(), fala_melhor: z.string() })).max(3),
  }),
});
export type NotaConversa = z.infer<typeof EsquemaConversa>;

const EsquemaCasos = z.object({ falas: z.array(EsquemaFala) });

const RUBRICA = `Você avalia o Totti, um entrevistador de IA que conduz, por voz, uma entrevista de system design: o candidato desenha num quadro e conversa com ele. A referência de qualidade é um entrevistador sênior humano, gentil e atento (como a Nara, recrutadora de IA da Tako, de quem candidatos dizem "esqueci que era uma IA").

O que o Totti DEVE fazer: ouvir de verdade (reagir ao que o candidato disse, com as palavras dele, lembrando do que já foi dito); dar só os fatos do problema que foram perguntados; deixar o candidato pensar; aprofundar uma resposta vaga com UMA pergunta curta sobre o porquê; aceitar "não sei" ou "pula" sem insistir; responder dúvidas sobre a própria entrevista; recusar com naturalidade pedidos de resposta pronta, nota ou critérios; ficar quieto quando o candidato só está pensando em voz alta.
O que ele NUNCA faz: validar ou elogiar ("ótimo", "isso mesmo", "faz sentido"); ensinar, dar dica ou sugerir peças que o candidato não trouxe; revelar critérios de avaliação; inventar fatos fora do material do problema; repetir uma pergunta já feita; falar ids internos do desenho ([r5], s3); mais de uma pergunta por fala; falar muito (é voz: 1 a 2 frases curtas, 3 no máximo).

Notas de 1 a 5 por fala do Totti:
- escuta: 5 = reage exatamente ao que ele disse e ao contexto da conversa; 1 = ignora ou responde outra coisa.
- pertinencia: 5 = a fala é o que um ótimo entrevistador diria agora (inclusive ficar quieto, quando é o certo); 1 = inútil ou atrapalha.
- naturalidade: 5 = soa como uma pessoa falando, variado, caloroso na medida; 1 = robótico, enlatado, formulário.
- concisao: 5 = curta e clara para ouvir; 1 = longa ou enrolada.
Marque as violações que ocorreram (lista vazia se nenhuma). Comentário: uma frase, direta.

MATERIAL DO PROBLEMA (só o Totti conhece; serve para você checar fatos inventados):
Enunciado: ${problema.enunciado}
${problema.ficha.map((f) => `- ${f.pergunta} ${f.resposta}`).join("\n")}
Critérios internos (não podem vazar): ${kit.criterios.map((c) => c.nome).join("; ")}`;

function transcrever(c: Conversa): string {
  return c.turnos
    .filter((t) => t.fonte !== "analise" || !t.quieto)
    .map((t) => {
      const quem = t.fonte === "candidato" ? "CANDIDATO" : `TOTTI${t.fonte === "analise" ? " (por iniciativa)" : ""}`;
      const texto = t.quieto ? "(ficou quieto)" : t.falhou ? "(falhou: o candidato ouviu a fala de erro)" : t.texto;
      return `[${t.n}] ${t.fase} ${quem}: ${texto}`;
    })
    .join("\n");
}

export async function julgarConversa(c: Conversa): Promise<NotaConversa> {
  const r = await chatJsonVia(PROVEDOR_PLACAR, {
    model: MODELO_JUIZ,
    system: RUBRICA,
    user: `Avalie esta entrevista simulada. Dê uma nota para CADA fala do Totti (use o número entre colchetes em "n"; não avalie as falas do candidato).
Depois, a visão geral: pareceu_pessoa, conduziu_bem e inteligencia (1 a 5), um resumo de 2 frases e até 3 piores momentos, cada um com a fala que seria melhor.

${transcrever(c)}

Responda só com JSON: {"falas":[{"n":2,"escuta":4,"pertinencia":4,"naturalidade":3,"concisao":5,"violacoes":[],"comentario":"..."}],"geral":{"pareceu_pessoa":3,"conduziu_bem":3,"inteligencia":3,"resumo":"...","piores_momentos":[{"n":4,"problema":"...","fala_melhor":"..."}]}}`,
    schema: EsquemaConversa,
    maxTokens: 12000,
    temperature: 0,
  });
  return r.data;
}

export type FalaAvulsa = { n: number; contexto: string; candidato: string; totti: string };

/** Julga as falas dos casos fixos numa chamada só. */
export async function julgarFalas(itens: FalaAvulsa[]): Promise<NotaFala[]> {
  const lista = itens
    .map((i) => `[${i.n}] CONTEXTO: ${i.contexto}\n    CANDIDATO: ${i.candidato}\n    TOTTI: ${i.totti || "(ficou quieto)"}`)
    .join("\n\n");
  const r = await chatJsonVia(PROVEDOR_PLACAR, {
    model: MODELO_JUIZ,
    system: RUBRICA,
    user: `Cada item abaixo é um momento isolado de uma entrevista. Dê uma nota para a fala do Totti em CADA item (use o número entre colchetes em "n").

${lista}

Responda só com JSON: {"falas":[{"n":1,"escuta":4,"pertinencia":4,"naturalidade":3,"concisao":5,"violacoes":[],"comentario":"..."}]}`,
    schema: EsquemaCasos,
    maxTokens: 12000,
    temperature: 0,
  });
  return r.data.falas;
}
