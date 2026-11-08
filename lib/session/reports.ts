/**
 * Relatórios prontos em disco (`data/reports/<sessionId>.json`). Só servidor.
 *
 * As sessões vivem em memória e somem quando o servidor reinicia; o relatório não pode sumir junto,
 * porque é ele que aparece no painel da vaga. O evaluator grava aqui quando termina, e o
 * GET /api/report lê daqui o que não está mais em memória.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Gravacao, Report } from "@/lib/contracts";

const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;

/** O que fica guardado: o relatório e quando a entrevista começou (o Report não traz a data). */
export interface ReportSalvo {
  startedAt: number;
  report: Report;
  /** Código, falas e execuções da sessão, para o relatório mostrar cada prova no minuto dela. */
  gravacao?: Gravacao;
}

const pasta = () => join(process.cwd(), "data", "reports");

export async function saveReport(startedAt: number, report: Report, gravacao?: Gravacao): Promise<void> {
  if (!ID_VALIDO.test(report.sessionId)) throw new Error(`id de sessão inválido: ${report.sessionId}`);
  await mkdir(pasta(), { recursive: true });
  const salvo: ReportSalvo = { startedAt, report, gravacao };
  await writeFile(join(pasta(), `${report.sessionId}.json`), JSON.stringify(salvo, null, 2), "utf8");
}

function parse(texto: string): ReportSalvo | undefined {
  try {
    const bruto = JSON.parse(texto) as { startedAt?: unknown; report?: unknown; gravacao?: unknown };
    const report = Report.safeParse(bruto.report);
    if (!report.success || typeof bruto.startedAt !== "number") return undefined;
    // Relatório antigo (sem gravação) ou gravação inválida: o relatório continua valendo, só sem os momentos.
    const gravacao = Gravacao.safeParse(bruto.gravacao);
    return { startedAt: bruto.startedAt, report: report.data, gravacao: gravacao.success ? gravacao.data : undefined };
  } catch {
    return undefined;
  }
}

export async function findReport(sessionId: string): Promise<ReportSalvo | undefined> {
  if (!ID_VALIDO.test(sessionId)) return undefined;
  try {
    return parse(await readFile(join(pasta(), `${sessionId}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

/** Todos os relatórios salvos. Arquivo inválido é ignorado. */
export async function listReports(): Promise<ReportSalvo[]> {
  let nomes: string[];
  try {
    nomes = (await readdir(pasta())).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const lidos = await Promise.all(nomes.map((n) => readFile(join(pasta(), n), "utf8").then(parse, () => undefined)));
  return lidos.filter((r): r is ReportSalvo => r !== undefined);
}
