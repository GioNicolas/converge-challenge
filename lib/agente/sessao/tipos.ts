// Tipos e esquemas Zod do contrato quadro <-> cérebro (docs/contrato-quadro-cerebro.md).
//
// ATENÇÃO: estes formatos são CÓPIA dos tipos de `lib/sessao/cliente.ts` (branch giorgio).
// O quadro valida o que recebe, então qualquer mudança aqui precisa ser combinada com o Giorgio
// e refletida nos dois lados. Não altere o contrato por conta própria.
import { z } from "zod";

export const FASES = [
  "AGUARDANDO",
  "APRESENTACAO",
  "REQUISITOS",
  "ALTO_NIVEL",
  "APROFUNDAMENTO",
  "FECHAMENTO",
  "ENCERRADA",
] as const;
export const EsquemaFase = z.enum(FASES);
export type Fase = z.infer<typeof EsquemaFase>;

export const EsquemaFalaRecente = z.object({
  quem: z.enum(["candidato", "agente"]),
  texto: z.string(),
});
export type FalaRecente = z.infer<typeof EsquemaFalaRecente>;

export const EsquemaPedidoAnalise = z.object({
  sessao_id: z.string(),
  fase: EsquemaFase,
  /** O desenho em texto (conversor). */
  grafo: z.string(),
  /** O que mudou desde a última análise. */
  mudancas: z.string(),
  conversa_recente: z.array(EsquemaFalaRecente),
  perguntas_feitas: z.number().int().min(0),
  imagem_url: z.string().nullable(),
  /** Segundos desde a última atividade do candidato (mexer no desenho ou falar). Ausente = desconhecido. */
  parado_ha_s: z.number().min(0).max(86_400).optional(),
  /** Requisitos já combinados e escritos no quadro. */
  requisitos: z.array(z.string().max(200)).max(30).optional(),
});
export type PedidoAnalise = z.infer<typeof EsquemaPedidoAnalise>;

export const EsquemaObservacao = z.object({
  criterio: z.string(),
  sinal: z.enum(["positivo", "negativo", "neutro"]),
  espontaneo: z.boolean(),
  evidencia: z.string(),
});
export type Observacao = z.infer<typeof EsquemaObservacao>;

export const STATUS_ANALISE = ["ok", "duvida", "redirecionar", "dica"] as const;
export type StatusAnalise = (typeof STATUS_ANALISE)[number];

// Mesmos defaults do `validarResposta` do quadro.
export const EsquemaRespostaAnalise = z.object({
  status: z.enum(STATUS_ANALISE),
  /** O que a voz fala. */
  pergunta: z.string().nullable().default(null),
  /** Versão curta que o agente escreve no quadro (~40 caracteres). */
  nota: z.string().nullable().default(null),
  /** IDs curtos do grafo que o agente circula. */
  elementos: z.array(z.string()).default([]),
  degrau: z.number().nullable().default(null),
  observacoes: z.array(EsquemaObservacao).default([]),
  /**
   * O candidato já mostrou o suficiente nesta fase e pode seguir para a próxima. Só vale em
   * ALTO_NIVEL (o servidor zera nas outras fases); o quadro avança para APROFUNDAMENTO.
   * Ausente = false.
   */
  avancar_fase: z.boolean().optional(),
});
export type RespostaAnalise = z.infer<typeof EsquemaRespostaAnalise>;
