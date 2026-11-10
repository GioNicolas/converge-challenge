/**
 * Como o microfone é aberto, em todas as salas (live coding, quadro, ditado da pré-entrevista).
 *
 * Sem cancelamento de eco, de propósito. Com `echoCancellation: true` o Chrome no Mac liga o processamento de voz do
 * sistema, que trata TODO o som que sai do computador como uma ligação: a voz do Totti ficava abafada e com eco,
 * bem pior que o mesmo áudio tocado fora da entrevista (o MP3 que o servidor entrega é idêntico ao da amostra).
 * O cancelamento também não faz falta: a escuta fica fechada enquanto o Totti fala (ninguém fala por cima de
 * ninguém) e a fala dele termina com ~0,2 s de silêncio, então a voz dele na caixa de som não volta como fala do
 * candidato. A redução de ruído continua ligada.
 */
export const AUDIO_DO_MICROFONE = { echoCancellation: false, noiseSuppression: true } as const;
