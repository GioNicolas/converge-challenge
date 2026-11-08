/**
 * Horário comercial (seg-sex, 9h-18h, horário de Recife/SP) + checagem de
 * conflito global: nenhum slot pode colidir com uma entrevista já marcada
 * de qualquer vaga. Fuso fixo UTC-3 (sem horário de verão desde 2019).
 */
import { store } from "./store";

const RECIFE_OFFSET_MS = -3 * 60 * 60 * 1000;
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ATTEMPTS = 200;

/** Hora local de Recife (0-23) e dia da semana (0=domingo) a partir de um instante UTC. */
function localParts(ms: number): { hour: number; weekday: number; dayStartMs: number } {
  const local = new Date(ms + RECIFE_OFFSET_MS);
  const dayStartMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - RECIFE_OFFSET_MS;
  return { hour: local.getUTCHours(), weekday: local.getUTCDay(), dayStartMs };
}

/** Empurra `ms` pra frente até o próximo início de horário comercial válido (seg-sex, 9h-18h). */
function nextBusinessStart(ms: number): number {
  let { hour, weekday, dayStartMs } = localParts(ms);

  // Fim de semana: vai pro próximo dia útil, 9h.
  while (weekday === 0 || weekday === 6) {
    dayStartMs += DAY_MS;
    ({ weekday } = localParts(dayStartMs));
    hour = 0;
  }

  if (hour < BUSINESS_START_HOUR) return dayStartMs + BUSINESS_START_HOUR * HOUR_MS;
  if (hour >= BUSINESS_END_HOUR) return nextBusinessStart(dayStartMs + DAY_MS);
  return ms;
}

function overlaps(startMs: number, endMs: number): boolean {
  return store.getBookedSlots().some((slot) => startMs < slot.endMs && endMs > slot.startMs);
}

/**
 * Acha e já reserva o primeiro slot livre, dentro do horário comercial, a
 * partir de `earliestStart` — sem colidir com nenhuma entrevista já marcada
 * (de qualquer vaga). Lança se não achar em `MAX_ATTEMPTS` tentativas.
 */
export function reserveSlot(durationMin: number, earliestStart: Date): Date {
  const durationMs = durationMin * 60_000;
  let candidate = nextBusinessStart(earliestStart.getTime());

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const endMs = candidate + durationMs;
    const { hour: endHour, dayStartMs } = localParts(endMs);
    const spillsPastBusinessHours = endHour >= BUSINESS_END_HOUR && endMs > dayStartMs + BUSINESS_END_HOUR * HOUR_MS;

    if (spillsPastBusinessHours) {
      candidate = nextBusinessStart(dayStartMs + DAY_MS);
      continue;
    }

    if (overlaps(candidate, endMs)) {
      const conflicting = store.getBookedSlots().find((slot) => candidate < slot.endMs && endMs > slot.startMs)!;
      candidate = nextBusinessStart(conflicting.endMs);
      continue;
    }

    store.bookSlot({ startMs: candidate, endMs });
    return new Date(candidate);
  }

  throw new Error(`Não achei horário comercial livre a partir de ${earliestStart.toISOString()}`);
}
