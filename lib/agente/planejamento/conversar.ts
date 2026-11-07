/**
 * Planejamento da entrevista por conversa: texto livre da vaga -> (perguntas) -> plano.
 * UMA chamada estruturada ao LLM por turno; saída validada com o schema do InterviewPlan.
 * Se inválida: UM retry com os erros; se falhar de novo, mensagem amigável (nunca lança).
 */
import { z } from "zod";
import { InterviewPlan, JobPosting } from "../../hiring/job-posting";
import { ErroLlm, type LlmCliente } from "../llm/cliente";
import { paraSlug } from "../kits/validar";
import { NOME_SCHEMA_PLANEJADOR, SISTEMA_PLANEJADOR } from "../prompts/planejador";

export const MODELO_PLANEJAMENTO_PADRAO = "anthropic/claude-sonnet-5.5";
export const MAX_TOKENS_PLANEJAMENTO = 2500;
export const TIMEOUT_PLANEJAMENTO_MS = 40_000;
export const MAX_DESCRICAO = 20_000;
export const MAX_HISTORICO = 40;
export const MAX_TEXTO_TURNO = 4000;

export function modeloPlanejamento(): string {
  return process.env.AGENTE_MODELO_PLANEJAMENTO?.trim() || MODELO_PLANEJAMENTO_PADRAO;
}

export type TurnoPlano = { quem: "usuario" | "agente"; texto: string };

// Schema que o modelo preenche: sem ids (o servidor deriva) e sem o refine (validamos depois).
const VagaLlm = JobPosting.omit({ id: true, niceToHave: true }).extend({ niceToHave: z.array(z.string()) });
const PlanoLlm = z.object({
  stages: z.array(
    z.object({
      tool: z.enum(["code_editor", "whiteboard"]),
      minutes: z.number().int(),
      challenge: z.object({ title: z.string(), brief: z.string() }),
      rationale: z.string(),
    }),
  ),
  focusPoints: z.array(z.object({ topic: z.string(), evidenceFromPosting: z.string(), weight: z.number() })),
  outOfScope: z.array(z.string()),
  summary: z.string(),
});
export const SaidaPlanejador = z.object({
  mensagem: z.string(),
  vaga: VagaLlm.nullable(),
  plano: PlanoLlm.nullable(),
  pronto: z.boolean(),
});
type SaidaPlanejador = z.infer<typeof SaidaPlanejador>;

export type ResultadoConversa = {
  mensagem: string;
  vaga: JobPosting | null;
  plano: InterviewPlan | null;
  pronto: boolean;
  /** Só quando a conversa falhou: motivo técnico (código/status/validação), sem conteúdo nem chave. */
  diagnostico?: string;
};

export type ArgsConversar = {
  llm: LlmCliente;
  descricao: string;
  historico: TurnoPlano[];
  planoAtual?: InterviewPlan | null;
  vagaAtual?: JobPosting | null;
  modelo?: string;
  sinal?: AbortSignal;
};

/** Texto colado é dado: não pode fechar a etiqueta que o delimita. */
const neutralizar = (t: string) => t.replace(/<\/?\s*descricao_colada\s*>/gi, "[tag removida]");

export function montarMensagemPlanejador(
  a: Pick<ArgsConversar, "descricao" | "historico" | "planoAtual" | "vagaAtual">,
): string {
  const partes = ["<descricao_colada>\n" + neutralizar(a.descricao.trim()) + "\n</descricao_colada>"];
  if (a.vagaAtual) partes.push("<vaga_estruturada_atual>\n" + JSON.stringify(a.vagaAtual) + "\n</vaga_estruturada_atual>");
  if (a.planoAtual) partes.push("<plano_atual>\n" + JSON.stringify(a.planoAtual) + "\n</plano_atual>");
  const conversa = a.historico.length
    ? a.historico.map((t) => `[${t.quem}] ${neutralizar(t.texto)}`).join("\n")
    : "(a conversa ainda não começou)";
  partes.push("<conversa>\n" + conversa + "\n</conversa>");
  partes.push(
    a.historico.length
      ? "Responda ao último turno do gestor."
      : "Abra a conversa: leia a vaga e faça suas perguntas essenciais (no máximo 3) ou, se a vaga já for clara, proponha o plano.",
  );
  return partes.join("\n\n");
}

/** Soma dos pesos fora de 1 por pouco: normaliza. Muito fora: deixa o schema reprovar. */
export function normalizarPesos<T extends { weight: number }>(fps: T[]): T[] {
  const soma = fps.reduce((s, f) => s + f.weight, 0);
  if (soma <= 0 || Math.abs(soma - 1) > 0.15 || Math.abs(soma - 1) <= 0.005) return fps;
  return fps.map((f) => ({ ...f, weight: Math.round((f.weight / soma) * 1000) / 1000 }));
}

function validar(
  s: SaidaPlanejador,
  vagaAtual: JobPosting | null | undefined,
  descricao: string,
): { ok: true; r: ResultadoConversa } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  let vaga: JobPosting | null = vagaAtual ?? null;
  if (s.vaga) {
    const id = vagaAtual?.id ?? paraSlug(s.vaga.title || descricao.slice(0, 40), "vaga");
    const v = JobPosting.safeParse({ ...s.vaga, id });
    if (v.success) vaga = v.data;
    else erros.push("vaga: " + v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  }
  let plano: InterviewPlan | null = null;
  if (s.plano) {
    if (s.plano.stages.some((e) => e.tool !== "whiteboard"))
      erros.push('plano: use somente a ferramenta "whiteboard" (code_editor está fora do escopo)');
    const p = InterviewPlan.safeParse({
      ...s.plano,
      focusPoints: normalizarPesos(s.plano.focusPoints),
      jobPostingId: vaga?.id ?? paraSlug(descricao.slice(0, 40), "vaga"),
    });
    if (p.success) plano = p.data;
    else erros.push("plano: " + p.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  }
  if (!s.mensagem.trim()) erros.push("mensagem vazia");
  if (erros.length) return { ok: false, erros };
  return { ok: true, r: { mensagem: s.mensagem.trim(), vaga, plano, pronto: !!plano && s.pronto } };
}

export const MSG_FALHA_PLANEJAMENTO =
  "Não consegui processar agora (o modelo falhou ou respondeu algo inválido). Tente enviar de novo.";

export async function conversarPlano(a: ArgsConversar): Promise<ResultadoConversa> {
  const reserva: ResultadoConversa = {
    mensagem: MSG_FALHA_PLANEJAMENTO,
    vaga: a.vagaAtual ?? null,
    plano: a.planoAtual ?? null,
    pronto: !!a.planoAtual,
  };
  const mensagens: { role: "user" | "assistant"; content: string }[] = [
    { role: "user", content: montarMensagemPlanejador(a) },
  ];
  let diagnostico = "";
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let saida: SaidaPlanejador;
    try {
      const r = await a.llm.completarJson({
        sistema: { estatico: SISTEMA_PLANEJADOR },
        mensagens,
        schema: SaidaPlanejador,
        nomeSchema: NOME_SCHEMA_PLANEJADOR,
        modelo: a.modelo ?? modeloPlanejamento(),
        maxTokens: MAX_TOKENS_PLANEJAMENTO,
        raciocinio: false,
        timeoutMs: TIMEOUT_PLANEJAMENTO_MS,
        sinal: a.sinal,
      });
      saida = r.dados;
    } catch (e) {
      if (e instanceof ErroLlm && e.codigo === "invalido" && tentativa === 1) {
        mensagens.push(
          { role: "assistant", content: "(resposta fora do schema)" },
          { role: "user", content: "Sua resposta não seguiu o schema JSON. Responda de novo, só com o JSON válido." },
        );
        continue;
      }
      diagnostico =
        e instanceof ErroLlm
          ? `${e.codigo}${e.status ? ` (HTTP ${e.status})` : ""}: ${e.message}`
          : `erro inesperado: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`[planejamento] falha na chamada ao modelo: ${diagnostico}`);
      return { ...reserva, diagnostico };
    }
    const v = validar(saida, a.vagaAtual, a.descricao);
    if (v.ok) return v.r;
    diagnostico = `plano rejeitado pela validação: ${v.erros.join("; ")}`;
    console.warn(`[planejamento] ${diagnostico}`);
    if (tentativa === 1) {
      mensagens.push(
        { role: "assistant", content: JSON.stringify(saida) },
        {
          role: "user",
          content: "Sua resposta foi rejeitada:\n- " + v.erros.join("\n- ") + "\nCorrija e responda de novo com o JSON completo.",
        },
      );
    }
  }
  return { ...reserva, diagnostico };
}
