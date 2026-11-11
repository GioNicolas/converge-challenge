import type { Alinhamento } from "../presenca/alinhamento";

/**
 * Folga de silêncio em volta da fala do Totti. O áudio do ElevenLabs começa a voz quase no primeiro milissegundo:
 * a saída de som (fone Bluetooth, placa que dorme sem som, troca de faixa no mesmo elemento) leva um instante para
 * acordar e engolia a primeira sílaba. No fim, desmontar o elemento logo no "ended" podia levar o finalzinho que
 * ainda estava a caminho da caixa de som. Por isso o MP3 ganha alguns quadros de silêncio nas duas pontas, e o
 * alinhamento é deslocado pelo mesmo tempo (a legenda e a mão do agente seguem a voz).
 */

/** Um quadro MP3 de silêncio (MPEG-1, 44,1 kHz, mono, 128 kbps) que não depende de quadro anterior. */
const QUADRO_SILENCIO_BASE64 = "//uQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
const AMOSTRAS_POR_QUADRO = 1152;
const TAXA = 44100;
/** ~0,26 s antes da voz e ~0,21 s depois. */
export const QUADROS_ANTES = 10;
export const QUADROS_DEPOIS = 8;
export const FOLGA_ANTES_S = (QUADROS_ANTES * AMOSTRAS_POR_QUADRO) / TAXA;
/**
 * Primeira fala, ou fala depois de a saída ficar parada: ~0,7 s antes da voz. O relato (#73) perdia de 0,5 a 0,7 s
 * ("...otti, vou montar"), mais que os 0,26 s da folga normal, porque a saída de som dormia entre as falas.
 */
export const QUADROS_ANTES_DEPOIS_DE_PARADA = 27;
/** Sem som há mais que isso, a saída pode ter dormido: a próxima fala usa a folga maior. */
export const PARADA_LONGA_MS = 5_000;

export const segundosDeQuadros = (quadros: number) => (quadros * AMOSTRAS_POR_QUADRO) / TAXA;

let ultimaSaidaEm: number | null = null;

/** Registra que a voz do Totti acabou de sair (fim de uma fala ou de uma parte dela). */
export function marcarSaidaDeSom(agora = performance.now()): void {
  ultimaSaidaEm = agora;
}

/** Quantos quadros de silêncio vão antes da próxima fala: mais quando a saída esteve parada (ou nunca tocou). */
export function quadrosAntesDaFala(agora = performance.now()): number {
  return ultimaSaidaEm === null || agora - ultimaSaidaEm > PARADA_LONGA_MS ? QUADROS_ANTES_DEPOIS_DE_PARADA : QUADROS_ANTES;
}

/** Só para testes: volta ao estado de "nada tocou ainda". */
export function esquecerSaidaDeSom(): void {
  ultimaSaidaEm = null;
}

let quadro: Uint8Array | null = null;
function quadroDeSilencio(): Uint8Array {
  quadro ??= Uint8Array.from(atob(QUADRO_SILENCIO_BASE64), (c) => c.charCodeAt(0));
  return quadro;
}

/** Tira a etiqueta ID3v2 do começo: no meio do fluxo (depois do silêncio) ela viraria lixo para o decodificador. */
export function semId3(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return bytes;
  const tamanho = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
  const rodape = bytes[5] & 0x10 ? 10 : 0;
  return bytes.subarray(Math.min(bytes.length, 10 + tamanho + rodape));
}

export function comFolga(
  bytes: Uint8Array,
  alinhamento: Alinhamento,
  quadrosAntes = QUADROS_ANTES,
): { bytes: Uint8Array; alinhamento: Alinhamento } {
  const silencio = quadroDeSilencio();
  const voz = semId3(bytes);
  const saida = new Uint8Array(silencio.length * (quadrosAntes + QUADROS_DEPOIS) + voz.length);
  let pos = 0;
  for (let i = 0; i < quadrosAntes; i++, pos += silencio.length) saida.set(silencio, pos);
  saida.set(voz, pos);
  pos += voz.length;
  for (let i = 0; i < QUADROS_DEPOIS; i++, pos += silencio.length) saida.set(silencio, pos);
  const folgaS = segundosDeQuadros(quadrosAntes);
  const deslocar = (t: number[]) => t.map((s) => s + folgaS);
  return {
    bytes: saida,
    alinhamento: {
      characters: alinhamento.characters,
      character_start_times_seconds: deslocar(alinhamento.character_start_times_seconds),
      character_end_times_seconds: deslocar(alinhamento.character_end_times_seconds),
    },
  };
}
