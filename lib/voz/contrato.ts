import { z } from "zod";

export const AlinhamentoVoz = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number().finite().nonnegative()),
  character_end_times_seconds: z.array(z.number().finite().nonnegative()),
}).refine((a) => a.characters.length > 0
  && a.characters.length === a.character_start_times_seconds.length
  && a.characters.length === a.character_end_times_seconds.length
  && a.character_end_times_seconds.every((fim, i) => fim >= a.character_start_times_seconds[i])
  && a.character_start_times_seconds.every((inicio, i, lista) => i === 0 || inicio >= lista[i - 1]));

export const RespostaVoz = z.object({ audio_base64: z.string().min(1), alinhamento: AlinhamentoVoz });
