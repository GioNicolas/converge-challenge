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
