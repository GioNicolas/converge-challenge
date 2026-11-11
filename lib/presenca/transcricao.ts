export type TrechoTranscrito = { texto: string; final: boolean; inicio: number };
export type EstadoTranscricao = {
  parcial: (TrechoTranscrito & { chave: string }) | null;
  finalizados: readonly string[];
};

export function estadoInicialTranscricao(): EstadoTranscricao {
  return { parcial: null, finalizados: [] };
}

/** Parciais substituem o texto atual. Finais repetidos são ignorados pela chave, não pelo texto. */
export function atualizarTranscricao(
  estado: EstadoTranscricao,
  trecho: TrechoTranscrito,
  chave: string,
): { estado: EstadoTranscricao; trecho: TrechoTranscrito | null } {
  if (estado.finalizados.includes(chave)) return { estado, trecho: null };
  const texto = trecho.texto.replace(/\s+/gu, " ").trim();
  const inicio = estado.parcial?.chave === chave ? estado.parcial.inicio : trecho.inicio;
  if (!trecho.final) {
    if ((estado.parcial?.texto ?? "") === texto && (!texto || estado.parcial?.chave === chave)) return { estado, trecho: null };
    const parcial = texto ? { texto, inicio, final: false, chave } : null;
    return { estado: { ...estado, parcial }, trecho: { texto, inicio, final: false } };
  }
  return {
    estado: { parcial: null, finalizados: [...estado.finalizados, chave].slice(-256) },
    trecho: texto ? { texto, inicio, final: true } : estado.parcial ? { texto: "", inicio, final: false } : null,
  };
}

/** Cinco retentativas: 500 ms, 1 s, 2 s, 4 s e 8 s. */
export function esperaParaReconectar(tentativa: number): number | null {
  return Number.isInteger(tentativa) && tentativa >= 0 && tentativa < 5 ? 500 * 2 ** tentativa : null;
}

/**
 * O Scribe "ouve" frases em silêncio e ruído de fundo (alucinação). Só aceitamos um trecho se o
 * microfone teve voz de verdade nele: blocos acima de LIMIAR_VOZ_RMS somando ao menos VOZ_MINIMA_MS.
 * O microfone já vem com supressão de ruído e ganho automático, então fala normal fica bem acima disso.
 */
export const LIMIAR_VOZ_RMS = 0.01;
export const VOZ_MINIMA_MS = 200;
/**
 * Com o portão aberto, energia acima disso (~-48 dBFS) ainda conta como fala: o fim de uma frase dito baixo
 * não corta. Abrir continua exigindo LIMIAR_VOZ_RMS, para o ruído de fundo não abrir o portão sozinho.
 */
export const LIMIAR_SUSTENTAR_RMS = 0.004;

export function energiaRms(amostras: Float32Array): number {
  if (!amostras.length) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i++) soma += amostras[i] * amostras[i];
  return Math.sqrt(soma / amostras.length);
}

export function misturarMono(canais: readonly Float32Array[]): Float32Array {
  const tamanho = canais[0]?.length ?? 0;
  if (canais.some((canal) => canal.length !== tamanho)) throw new RangeError("Os canais devem ter o mesmo tamanho.");
  const mono = new Float32Array(tamanho);
  for (let i = 0; i < tamanho; i++) {
    for (const canal of canais) mono[i] += canal[i] / canais.length;
  }
  return mono;
}

export type EstadoReamostragem = { soma: number; peso: number };

/** Média ponderada por janela, preservando a fração entre blocos de 44,1/48 kHz. */
export function reamostrar(
  amostras: Float32Array,
  taxaOrigem: number,
  taxaDestino = 16000,
  anterior: EstadoReamostragem = { soma: 0, peso: 0 },
): { amostras: Float32Array; estado: EstadoReamostragem } {
  if (!Number.isFinite(taxaOrigem) || !Number.isFinite(taxaDestino) || taxaOrigem <= 0 || taxaDestino <= 0) {
    throw new RangeError("As taxas de áudio devem ser finitas e positivas.");
  }
  const passo = taxaOrigem / taxaDestino;
  const resultado: number[] = [];
  let { soma, peso } = anterior;
  for (const amostra of amostras) {
    let restante = 1;
    while (restante > 1e-10) {
      const parte = Math.min(restante, passo - peso);
      soma += amostra * parte;
      peso += parte;
      restante -= parte;
      if (peso >= passo - 1e-10) {
        resultado.push(soma / passo);
        soma = 0;
        peso = 0;
      }
    }
  }
  return { amostras: new Float32Array(resultado), estado: { soma, peso } };
}

export function pcm16LE(amostras: Float32Array): Uint8Array {
  const bytes = new Uint8Array(amostras.length * 2);
  const vista = new DataView(bytes.buffer);
  amostras.forEach((amostra, i) => {
    const valor = Number.isFinite(amostra) ? Math.max(-1, Math.min(1, amostra)) : 0;
    vista.setInt16(i * 2, Math.round(valor * (valor < 0 ? 32768 : 32767)), true);
  });
  return bytes;
}

/** Contrato WebSocket público: autenticação apenas pelo token temporário. */
export function urlDoScribe(token: string): string {
  const parametros = new URLSearchParams({
    model_id: "scribe_v2_realtime", token, audio_format: "pcm_16000", language_code: "pt",
    commit_strategy: "vad", vad_silence_threshold_secs: "0.9", include_timestamps: "false",
  });
  return `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${parametros}`;
}

export function mensagemDeAudio(amostras: Float32Array, commit = false): string {
  const bytes = pcm16LE(amostras);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: btoa(binario), commit, sample_rate: 16000 });
}

/** Folga de áudio antes da fala, para não cortar a primeira sílaba. */
export const PORTAO_ANTES_MS = 300;
/** Folga depois da fala: maior que o vad_silence_threshold_secs (0,9 s), para o Scribe fechar o trecho. */
export const PORTAO_DEPOIS_MS = 1200;

export type PortaoDeVoz = {
  readonly aberto: boolean;
  /** Recebe um bloco já em 16 kHz e devolve o que deve ir ao Scribe (vazio com o portão fechado). */
  passar(amostras: Float32Array, voz: boolean): { amostras: Float32Array; abriu: boolean; fechou: boolean };
  /** Fecha um trecho interrompido: devolve silêncio pelo resto da folga, para o Scribe confirmar o trecho. */
  encerrar(): Float32Array;
  reiniciar(): void;
};

/**
 * Portão de voz local: o Scribe cobra por tempo de áudio enviado, então só vai áudio em volta de fala.
 * Com o portão fechado guarda os últimos `antesMs` (abertura leva junto o começo da fala); depois da última
 * voz continua aberto por `depoisMs`.
 */
export function criarPortaoDeVoz(opcoes: { taxa?: number; antesMs?: number; depoisMs?: number } = {}): PortaoDeVoz {
  const taxa = opcoes.taxa ?? 16000;
  const antes = Math.round(((opcoes.antesMs ?? PORTAO_ANTES_MS) / 1000) * taxa);
  const depois = Math.round(((opcoes.depoisMs ?? PORTAO_DEPOIS_MS) / 1000) * taxa);
  let aberto = false;
  let restante = 0;
  let anterior = new Float32Array(0);
  const vazio = new Float32Array(0);
  return {
    get aberto() { return aberto; },
    passar(amostras, voz) {
      if (voz) {
        restante = depois;
        if (aberto) return { amostras, abriu: false, fechou: false };
        aberto = true;
        const saida = new Float32Array(anterior.length + amostras.length);
        saida.set(anterior);
        saida.set(amostras, anterior.length);
        anterior = vazio;
        return { amostras: saida, abriu: true, fechou: false };
      }
      if (aberto) {
        restante -= amostras.length;
        if (restante <= 0) aberto = false;
        return { amostras, abriu: false, fechou: !aberto };
      }
      const junto = new Float32Array(anterior.length + amostras.length);
      junto.set(anterior);
      junto.set(amostras, anterior.length);
      anterior = junto.slice(Math.max(0, junto.length - antes));
      return { amostras: vazio, abriu: false, fechou: false };
    },
    encerrar() {
      const silencio = new Float32Array(aberto ? Math.max(0, restante) : 0);
      aberto = false;
      restante = 0;
      anterior = vazio;
      return silencio;
    },
    reiniciar() {
      aberto = false;
      restante = 0;
      anterior = vazio;
    },
  };
}

/** Fila de amostras em blocos: guardar e tirar copiam só o que entra ou sai, não a fila inteira. */
export type FilaDeAmostras = {
  readonly length: number;
  guardar(amostras: Float32Array): void;
  /** Tira até `n` amostras do começo da fila. */
  tirar(n: number): Float32Array;
  /** Devolve ao começo o que foi tirado e não pôde ser enviado. */
  devolver(amostras: Float32Array): void;
  limpar(): void;
};

export function criarFilaDeAmostras(maximo: number): FilaDeAmostras {
  let blocos: Float32Array[] = [];
  let total = 0;
  return {
    get length() { return total; },
    guardar(amostras) {
      if (!amostras.length) return;
      blocos.push(amostras.slice());
      total += amostras.length;
      // Acima do máximo descarta o mais antigo.
      while (total > maximo) {
        const excesso = total - maximo;
        if (blocos[0].length <= excesso) total -= blocos.shift()!.length;
        else { blocos[0] = blocos[0].subarray(excesso); total -= excesso; }
      }
    },
    tirar(n) {
      const saida = new Float32Array(Math.min(n, total));
      let escrito = 0;
      while (escrito < saida.length) {
        const bloco = blocos[0];
        const parte = Math.min(bloco.length, saida.length - escrito);
        saida.set(bloco.subarray(0, parte), escrito);
        escrito += parte;
        if (parte === bloco.length) blocos.shift();
        else blocos[0] = bloco.subarray(parte);
      }
      total -= saida.length;
      return saida;
    },
    devolver(amostras) {
      if (!amostras.length) return;
      blocos.unshift(amostras);
      total += amostras.length;
    },
    limpar() { blocos = []; total = 0; },
  };
}
