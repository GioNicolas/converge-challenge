/**
 * Horários oferecidos pra triagem: próximos 5 dias úteis (a partir de amanhã), no fuso de Brasília.
 * Função pura: recebe o "agora" pra ser testável.
 */

const FUSO = "America/Sao_Paulo";
/** Brasília não tem horário de verão desde 2019, então o offset é fixo. */
const OFFSET = "-03:00";
const HORAS = ["09:00", "10:30", "14:00", "16:00"];
const DIAS_UTEIS = 5;
const DIA_MS = 24 * 60 * 60 * 1000;

export function horariosDisponiveis(agora: Date = new Date()): string[] {
  // Data civil em Brasília (não a UTC): depois das 21h, UTC já está no dia seguinte.
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const hojeUtc = Date.UTC(valor("year"), valor("month") - 1, valor("day"));

  const slots: string[] = [];
  let uteis = 0;
  for (let i = 1; uteis < DIAS_UTEIS; i++) {
    const dia = new Date(hojeUtc + i * DIA_MS);
    const diaSemana = dia.getUTCDay();
    if (diaSemana === 0 || diaSemana === 6) continue;
    uteis++;
    const data = dia.toISOString().slice(0, 10);
    for (const hora of HORAS) slots.push(`${data}T${hora}:00${OFFSET}`);
  }
  return slots;
}
