/**
 * Kit de avaliação: o que muda de uma área para outra (dados, não código).
 * Só existe no servidor: a ficha de requisitos e a rubrica NUNCA vão ao navegador.
 */
import { z } from "zod";

/** Um critério da rubrica, com a descrição fixa de cada nota (1 a 4). */
export const Criterio = z.object({
  id: z.string(), // ex.: "escalabilidade" (é o `criterio` das observações)
  nome: z.string(),
  /** Descrição de cada nota; dá consistência ao agente e explica a nota ao recrutador. */
  niveis: z.object({ 1: z.string(), 2: z.string(), 3: z.string(), 4: z.string() }),
});
export type Criterio = z.infer<typeof Criterio>;

/** Pergunta provável do candidato e a resposta oficial (a "ficha de requisitos ocultos"). */
export const ItemFicha = z.object({ pergunta: z.string(), resposta: z.string() });

export const Problema = z.object({
  id: z.string(), // ex.: "encurtador_url"
  titulo: z.string(),
  /** Vago de propósito: perguntar antes de desenhar é o primeiro sinal avaliado. */
  enunciado: z.string(),
  /**
   * O que o entrevistador FALA ao abrir a sessão: uma apresentação natural do tema, em pt-BR falado
   * (não a leitura do enunciado). Público como o enunciado: sem números da ficha. Opcional: sem ele
   * o quadro monta uma fala simples a partir do título e do enunciado.
   */
  falaDoDesafio: z.string().optional(),
  ficha: z.array(ItemFicha),
  sinaisEsperados: z.array(z.string()),
  /** O que uma solução fraca costuma ter; vira pergunta. */
  armadilhas: z.array(z.string()),
  perguntasSugeridas: z.array(z.string()),
});
/**
 * Empecilho do quadro: no meio da entrevista o entrevistador traz UMA mudança no problema (um requisito muda,
 * entra uma restrição nova ou cai uma parte do sistema). O conteúdo é escrito à mão, por problema, e nunca
 * inventado pelo modelo. Fica fora do schema Zod de propósito: o gerador de kits (modo estrito, todo campo
 * obrigatório) não deve ser forçado a criar um. Só servidor até ser anunciado.
 */
export type Empecilho = {
  id: string;
  tipo: "requisito_muda" | "restricao_nova" | "parte_cai";
  /** O que o entrevistador fala, em pt-BR falado. Termina deixando a bola com o candidato. */
  fala: string;
  /** O que ele escreve no quadro, como requisito novo (até 50 caracteres). */
  requisito: string;
  /** O que a mudança pede do desenho (para a análise e o scorecard; nunca falado). */
  exige: string;
};

export type Problema = z.infer<typeof Problema> & { empecilho?: Empecilho };

export const TipoPergunta = z.object({ nome: z.string(), exemplo: z.string(), revela: z.string() });

export const Kit = z.object({
  id: z.string(), // ex.: "system_design"
  /** Aparece no cartão de início: "Entrevista de {area}". */
  area: z.string(),
  /** Quem o entrevistador "é". */
  persona: z.string(),
  tipoEntrevista: z.string(),
  /** Como o quadro é lido (2.5.1 do planejamento). */
  modoLeitura: z.enum(["grafo", "visual", "misto"]),
  criterios: z.array(Criterio).min(1),
  tiposPergunta: z.array(TipoPergunta),
  termosTranscricao: z.array(z.string()),
  problemas: z.array(Problema).min(1),
});
export type Kit = Omit<z.infer<typeof Kit>, "problemas"> & { problemas: Problema[] };
