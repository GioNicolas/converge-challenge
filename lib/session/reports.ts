/**
 * Relatórios prontos, no Supabase quando configurado e senão em disco (`data/reports/<sessionId>.json`). Só servidor.
 *
 * As sessões vivem em memória e somem quando o servidor reinicia; o relatório não pode sumir junto,
 * porque é ele que aparece no painel da vaga. O evaluator grava aqui quando termina, e o
 * GET /api/report lê daqui o que não está mais em memória.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Report } from "@/lib/contracts";
import { kvRemoto } from "@/lib/storage/kv";

const ID_VALIDO = /^[A-Za-z0-9_-]{1,80}$/;

/** O que fica guardado: o relatório e quando a entrevista começou (o Report não traz a data). */
export interface ReportSalvo {
  startedAt: number;
  report: Report;
}

const pasta = () => join(process.cwd(), "data", "reports");

export async function saveReport(startedAt: number, report: Report): Promise<void> {
  if (!ID_VALIDO.test(report.sessionId)) throw new Error(`id de sessão inválido: ${report.sessionId}`);
  const salvo: ReportSalvo = { startedAt, report };
  const kv = kvRemoto();
  if (kv) {
    await kv.set("relatorio", report.sessionId, salvo);
    return;
  }
  await mkdir(pasta(), { recursive: true });
  await writeFile(join(pasta(), `${report.sessionId}.json`), JSON.stringify(salvo, null, 2), "utf8");
}

function parse(texto: string): ReportSalvo | undefined {
  try {
    return parseObjeto(JSON.parse(texto));
  } catch {
    return undefined;
  }
}

function parseObjeto(valor: unknown): ReportSalvo | undefined {
  try {
    const bruto = valor as { startedAt?: unknown; report?: unknown };
    const report = Report.safeParse(bruto.report);
    if (!report.success || typeof bruto.startedAt !== "number") return undefined;
    return { startedAt: bruto.startedAt, report: report.data };
  } catch {
    return undefined;
  }
}

export async function findReport(sessionId: string): Promise<ReportSalvo | undefined> {
  if (!ID_VALIDO.test(sessionId)) return undefined;
  try {
    const kv = kvRemoto();
    if (kv) return parseObjeto(await kv.get("relatorio", sessionId));
    return parse(await readFile(join(pasta(), `${sessionId}.json`), "utf8"));
  } catch {
    return undefined;
  }
}

/** Todos os relatórios salvos. Arquivo inválido é ignorado. */
export async function listReports(): Promise<ReportSalvo[]> {
  const kv = kvRemoto();
  if (kv) {
    return (await kv.list("relatorio")).map((l) => parseObjeto(l.value)).filter((r): r is ReportSalvo => r !== undefined);
  }
  let nomes: string[];
  try {
    nomes = (await readdir(pasta())).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const lidos = await Promise.all(nomes.map((n) => readFile(join(pasta(), n), "utf8").then(parse, () => undefined)));
  return lidos.filter((r): r is ReportSalvo => r !== undefined);
}
