/**
 * Horários oferecidos pra triagem: próximos 5 dias úteis (a partir de amanhã), no fuso de Brasília.
 * Entram também dois horários daqui a 3 e 5 minutos, pra testar o fluxo inteiro rápido. Ligados por padrão;
 * HORARIOS_DE_TESTE=0 desliga.
 * Funções puras: recebem o "agora" pra serem testáveis.
 */

const FUSO = "America/Sao_Paulo";
/** Brasília não tem horário de verão desde 2019, então o offset é fixo. */
const OFFSET = "-03:00";
const OFFSET_MS = -3 * 60 * 60 * 1000;
const HORAS = ["09:00", "10:30", "14:00", "16:00"];
const DIAS_UTEIS = 5;
const DIA_MS = 24 * 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;

/** Daqui a quantos minutos ficam os horários de teste. */
const MINUTOS_TESTE = [3, 5];
/**
 * Janela aceita no POST para um horário de teste. Os horários de teste andam com o relógio, então
 * a lista gerada no GET não bate com a gerada no POST: em vez de comparar listas, aceita qualquer
 * minuto cheio nessa janela. O passado tolera quem demora a clicar em "Confirmar".
 */
const TESTE_TOLERANCIA_PASSADO_MS = 5 * MINUTO_MS;
const TESTE_JANELA_FUTURO_MS = 15 * MINUTO_MS;
/** Formato exato que geramos: minuto cheio, offset de Brasília. */
const FORMATO_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-03:00$/;

export const horariosDeTesteLigados = () => process.env.HORARIOS_DE_TESTE !== "0";

/** Instante em ISO com o relógio de Brasília e offset -03:00 (ex.: 2026-11-07T10:03:00-03:00). */
function isoBrasilia(ms: number): string {
  return `${new Date(ms + OFFSET_MS).toISOString().slice(0, 16)}:00${OFFSET}`;
}

/** Agora + 3 e + 5 min, arredondados pra cima até o minuto cheio (nunca menos que 3 min de folga). */
export function horariosDeTeste(agora: Date = new Date()): string[] {
  const minutoCheio = Math.ceil(agora.getTime() / MINUTO_MS) * MINUTO_MS;
  return MINUTOS_TESTE.map((m) => isoBrasilia(minutoCheio + m * MINUTO_MS));
}

/** Os horários normais (dias úteis), sem os de teste. */
export function horariosRegulares(agora: Date = new Date()): string[] {
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

/** Lista mostrada ao candidato: os de teste primeiro (se ligados), depois os regulares. */
export function horariosDisponiveis(agora: Date = new Date()): string[] {
  const regulares = horariosRegulares(agora);
  return horariosDeTesteLigados() ? [...horariosDeTeste(agora), ...regulares] : regulares;
}

/** Horário de teste aceitável agora: flag ligada, formato exato e dentro da janela curta. */
export function ehHorarioDeTesteValido(horario: string, agora: Date = new Date()): boolean {
  if (!horariosDeTesteLigados() || !FORMATO_ISO.test(horario)) return false;
  const ms = Date.parse(horario);
  if (Number.isNaN(ms)) return false;
  const delta = ms - agora.getTime();
  return delta >= -TESTE_TOLERANCIA_PASSADO_MS && delta <= TESTE_JANELA_FUTURO_MS;
}

/** Validação do POST de agendar: um horário regular, ou um de teste dentro da janela. */
export function horarioAceito(horario: string, agora: Date = new Date()): boolean {
  return horariosRegulares(agora).includes(horario) || ehHorarioDeTesteValido(horario, agora);
}
