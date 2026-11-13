// Tipos e esquemas Zod do contrato quadro <-> cérebro (docs/contrato-quadro-cerebro.md).
//
// ATENÇÃO: estes formatos são CÓPIA dos tipos de `lib/sessao/cliente.ts` (branch giorgio).
// O quadro valida o que recebe, então qualquer mudança aqui precisa ser combinada com o Giorgio
// e refletida nos dois lados. Não altere o contrato por conta própria.
import { z } from "zod";
import { EsquemaVisualOpcional } from "../../presenca/acoesVisuais";

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

/** Teto da foto do quadro (data URL). */
export const MAX_IMAGEM_BASE64 = 500_000;
/**
 * Foto do quadro opcional: grande demais vira null em vez de derrubar o pedido com 400. A foto é um extra; a
 * análise e a fala seguem só com o texto do desenho.
 */
export const EsquemaImagemOpcional = z
  .string()
  .nullable()
  .transform((v) => (typeof v === "string" && v.length <= MAX_IMAGEM_BASE64 ? v : null))
  .optional();

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
  /** Foto leve do quadro (data URL JPEG), para o modelo ver o desenho além do grafo. Ausente = só o grafo. */
  imagem_base64: EsquemaImagemOpcional,
  /** Segundos desde a última atividade do candidato (mexer no desenho ou falar). Ausente = desconhecido. */
  parado_ha_s: z.number().min(0).max(86_400).optional(),
  /** Requisitos já combinados e escritos no quadro. */
  requisitos: z.array(z.string().max(200)).max(30).optional(),
  gestos_recentes: z.array(z.string().max(250)).max(6).optional(),
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
  visual: EsquemaVisualOpcional,
  degrau: z.number().nullable().default(null),
  observacoes: z.array(EsquemaObservacao).default([]),
  /**
   * O candidato já mostrou o suficiente nesta fase e pode seguir para a próxima. Só vale em
   * ALTO_NIVEL (o servidor zera nas outras fases); o quadro avança para APROFUNDAMENTO.
   * Ausente = false.
   */
  avancar_fase: z.boolean().optional(),
  /**
   * O candidato terminou uma parte coerente do desenho (ex.: o fluxo de escrita inteiro, a escolha do armazenamento
   * com o porquê, o caminho de leitura) e há informação para uma pergunta sobre a parte inteira. Sem isso, em
   * ALTO_NIVEL e APROFUNDAMENTO a pergunta só sai no teto (ver `motivoDoConteudo`, sessao/politica.ts). Ausente = false.
   */
  parteFechada: z.boolean().default(false),
});
export type RespostaAnalise = z.infer<typeof EsquemaRespostaAnalise>;
