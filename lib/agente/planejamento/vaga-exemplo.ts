// Texto de exemplo de vaga para a página /dev/vaga (sem dependências de servidor).
import type { JobPosting } from "../../hiring/job-posting";
import { JOB_POSTINGS } from "../../hiring/mocks/job-postings";

const NIVEL: Record<JobPosting["seniority"], string> = {
  junior: "Júnior",
  pleno: "Pleno",
  senior: "Sênior",
  staff: "Staff",
};

const lista = (itens: string[]) => itens.map((i) => `- ${i}`).join("\n");

/** Vaga estruturada -> texto corrido como uma empresa publicaria. */
export function textoDaVaga(v: JobPosting): string {
  const partes = [
    `${v.title} (${NIVEL[v.seniority]})`,
    v.description,
    `Responsabilidades:\n${lista(v.responsibilities)}`,
    `Requisitos:\n${lista(v.requirements)}`,
  ];
  if (v.niceToHave.length) partes.push(`Diferenciais:\n${lista(v.niceToHave)}`);
  if (v.stack.length) partes.push(`Stack / ferramentas: ${v.stack.join(", ")}`);
  return partes.join("\n\n");
}

/** Vaga de exemplo pelo índice (dá a volta nas vagas do mock). */
export function vagaDeExemplo(indice: number): { vaga: JobPosting; texto: string } {
  const n = JOB_POSTINGS.length;
  const vaga = JOB_POSTINGS[((indice % n) + n) % n];
  return { vaga, texto: textoDaVaga(vaga) };
}
