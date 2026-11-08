/**
 * O Totti aprende com uma decisão: registra a decisão (para a concordância), extrai as regras do motivo,
 * guarda as regras e os trechos ignorados. Quem chama (o hook do Slack) responde na thread com o resultado.
 */
import type { Report } from "@/lib/contracts";
import { chamarModeloPadrao, extrairRegras, type ChamarModelo, type ResultadoExtrator } from "./extrator";
import { adicionarRegra, registrarDecisao, registrarMotivoIgnorado } from "./store";
import type { DecisaoTechLead, MotivoIgnorado, OrigemRegra, RegraSquad } from "./tipos";

export interface Aprendizado {
  regras: RegraSquad[];
  ignorados: MotivoIgnorado[];
  via: ResultadoExtrator["via"];
}

async function guardar(
  empresaId: string,
  origem: OrigemRegra,
  resultado: ResultadoExtrator,
): Promise<Aprendizado> {
  const regras = resultado.regras.map((r) => adicionarRegra({ empresaId, ...r, origem }));
  const ignorados = resultado.ignorados.map((i) => registrarMotivoIgnorado({ empresaId, ...i, origem }));
  return { regras, ignorados, via: resultado.via };
}

/** Aprovar ou Reprovar no Slack. */
export async function aprenderComDecisao(
  input: {
    empresaId: string;
    vagaId: string;
    vagaTitulo?: string;
    candidato: string;
    decisao: DecisaoTechLead;
    motivo?: string;
    report: Pick<Report, "recommendation" | "overallScore" | "criteria">;
  },
  /** null: sem modelo (só palavras-chave). */
  chamar: ChamarModelo | null = chamarModeloPadrao() ?? null,
): Promise<Aprendizado> {
  registrarDecisao({
    empresaId: input.empresaId,
    vagaId: input.vagaId,
    vagaTitulo: input.vagaTitulo,
    candidato: input.candidato,
    recomendacaoTotti: input.report.recommendation,
    decisaoTechLead: input.decisao,
    motivo: input.motivo,
  });
  const origem: OrigemRegra = {
    tipo: input.decisao === "aprovado" ? "aprovacao" : "reprovacao",
    candidato: input.candidato,
    vagaId: input.vagaId,
  };
  const resultado = await extrairRegras({ motivo: input.motivo ?? "", origem, report: input.report }, chamar ?? undefined);
  return guardar(input.empresaId, origem, resultado);
}

/** Pedido de ajuste no plano da entrevista. */
export async function aprenderComAjuste(
  input: { empresaId: string; vagaId: string; comentario: string },
  /** null: sem modelo (só palavras-chave). */
  chamar: ChamarModelo | null = chamarModeloPadrao() ?? null,
): Promise<Aprendizado> {
  const origem: OrigemRegra = { tipo: "ajuste_plano", vagaId: input.vagaId };
  const resultado = await extrairRegras({ motivo: input.comentario, origem }, chamar ?? undefined);
  return guardar(input.empresaId, origem, resultado);
}
