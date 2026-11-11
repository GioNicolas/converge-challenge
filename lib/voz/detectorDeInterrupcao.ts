/**
 * Interrupção pela voz: com o Totti falando, a pessoa fala por cima e ele para.
 *
 * O microfone abre sem cancelamento de eco (lib/presenca/microfone.ts), então com caixa de som a voz do próprio
 * Totti volta pelo microfone. Por isso nada vai para a transcrição enquanto ele fala: o detector só mede a energia
 * do microfone. Ele aprende o vazamento da voz do Totti no começo de cada fala (linha de base) e só dispara quando a
 * energia passa de linha de base × fator por um tempo mínimo seguido. Com fone a linha de base é quase zero e vale o
 * piso; com caixa de som o limiar sobe sozinho.
 *
 * Reutilizável: a pré-entrevista usa hoje; o quadro e o live coding vão usar na #97.
 */
import { iniciarCapturaAntecipada, MAXIMO_BYTES_ANTECIPADOS, type CapturaAntecipada } from "../transcricao/capturaAntecipada";
import { capturarAudio } from "../transcricao/captura";
import { energiaPcm16 } from "../transcricao/energia";
import { LIMIAR_VOZ_RMS } from "../presenca/transcricao";

export type OpcoesRegra = {
  /** Ignorado no começo de cada fala: a folga de silêncio antes da voz (lib/voz/folga.ts) não é vazamento. */
  ignorarMs?: number;
  /** Janela, depois do ignorado, em que o vazamento da voz do Totti é medido. */
  linhaDeBaseMs?: number;
  /** Quantas vezes acima do vazamento a energia precisa estar para contar como fala da pessoa. */
  fator?: number;
  /** Limiar mínimo (fone: o vazamento é quase zero). */
  piso?: number;
  /** Tempo seguido acima do limiar para disparar. */
  minimoMs?: number;
};

export const REGRA_PADRAO: Required<OpcoesRegra> = {
  ignorarMs: 300,
  linhaDeBaseMs: 300,
  fator: 3,
  piso: LIMIAR_VOZ_RMS * 2,
  minimoMs: 250,
};

/**
 * O vazamento muda ao longo da fala (sílabas fortes, frases mais altas). Fora de uma possível interrupção, a linha
 * de base acompanha o pico do vazamento e decai devagar (meia-vida de ~1 s), para uma frase mais alta do Totti não
 * passar por fala da pessoa.
 */
const MEIA_VIDA_LINHA_DE_BASE_MS = 1000;

export type RegraDeInterrupcao = {
  /** Mede um bloco do microfone; devolve true no bloco em que a interrupção dispara (uma vez por fala). */
  medir(energia: number, duracaoMs: number): boolean;
  /** Começa uma fala nova do Totti: mede o vazamento de novo. */
  reiniciar(): void;
  readonly limiar: number;
};

/** A regra pura (sem microfone), para testar linha de base, limiar e tempo mínimo. */
export function criarRegraDeInterrupcao(opcoes: OpcoesRegra = {}): RegraDeInterrupcao {
  const r = { ...REGRA_PADRAO, ...opcoes };
  let decorrido = 0;
  let base = 0;
  let acima = 0;
  let disparou = false;
  const limiar = () => Math.max(r.piso, base * r.fator);
  return {
    get limiar() { return limiar(); },
    reiniciar() { decorrido = 0; base = 0; acima = 0; disparou = false; },
    medir(energia, duracaoMs) {
      if (disparou) return false;
      const antes = decorrido;
      decorrido += duracaoMs;
      if (antes < r.ignorarMs) return false;
      if (antes < r.ignorarMs + r.linhaDeBaseMs) {
        base = Math.max(base, energia);
        return false;
      }
      if (energia >= limiar()) {
        acima += duracaoMs;
        if (acima >= r.minimoMs) { disparou = true; return true; }
        return false;
      }
      acima = 0;
      base = Math.max(energia, base * 0.5 ** (duracaoMs / MEIA_VIDA_LINHA_DE_BASE_MS));
      return false;
    },
  };
}

/** Áudio de antes do disparo entregue à transcrição: ~300 ms antes da fala mais os ~300 ms que dispararam. */
export const BYTES_ANTES_DO_DISPARO = 19_200;

export type DetectorDeInterrupcao = {
  /** Começa a escutar (o Totti começou a falar). Chamar de novo numa fala nova recalibra. */
  iniciar(): void;
  /** Para de escutar e solta o microfone (o Totti terminou, ou a interrupção foi tratada). */
  parar(): void;
};

/**
 * Detector no navegador. Ao disparar, entrega a captura já aberta, com os ~600 ms de áudio anteriores guardados:
 * quem a recebe (o ditado) passa a mandar esse áudio à transcrição, e a primeira palavra não se perde. Quem recebe
 * a captura passa a ser o dono dela; o detector não a fecha mais.
 */
export function criarDetectorDeInterrupcao({ aoInterromper, regra, obterStream, capturar = capturarAudio }: {
  aoInterromper: (captura: CapturaAntecipada) => void;
  regra?: OpcoesRegra;
  obterStream?: () => Promise<MediaStream | null | undefined>;
  capturar?: typeof capturarAudio;
}): DetectorDeInterrupcao {
  const medidor = criarRegraDeInterrupcao(regra);
  let captura: CapturaAntecipada | null = null;
  function parar() {
    captura?.cancelar();
    captura = null;
  }
  return {
    iniciar() {
      medidor.reiniciar();
      if (captura) return;
      const atual = iniciarCapturaAntecipada({
        stream: obterStream?.(),
        maximoBytes: BYTES_ANTES_DO_DISPARO,
        capturar: (o) => capturar({
          ...o,
          aoAudio: (base64) => {
            const disparou = captura === atual && (() => {
              const { energia, duracaoMs } = energiaPcm16(base64);
              return medidor.medir(energia, duracaoMs);
            })();
            o.aoAudio(base64);
            if (!disparou) return;
            captura = null;
            // Daqui em diante é a fala da pessoa: guarda tudo até a transcrição conectar.
            atual.limitar(MAXIMO_BYTES_ANTECIPADOS);
            aoInterromper(atual);
          },
        }),
      });
      captura = atual;
      // Sem microfone (permissão negada, sem dispositivo): só a interrupção manual continua valendo.
      atual.pronta.catch(() => { if (captura === atual) captura = null; });
    },
    parar,
  };
}
