// PCM de 16 bits, em blocos de 100 ms. O AudioContext faz a conversão para 16 kHz.
class TranscricaoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.amostras = [];
    this.ativo = true;
    this.port.onmessage = ({ data }) => {
      if (data === "finalizar") {
        this.enviar();
        this.ativo = false;
        this.port.postMessage("finalizado");
      }
    };
  }

  enviar() {
    if (!this.amostras.length) return;
    const bytes = new ArrayBuffer(this.amostras.length * 2);
    const view = new DataView(bytes);
    this.amostras.forEach((amostra, i) => {
      const s = Math.max(-1, Math.min(1, amostra));
      view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
    });
    this.amostras = [];
    this.port.postMessage(bytes, [bytes]);
  }

  process(inputs) {
    if (!this.ativo) return false;
    const canal = inputs[0]?.[0];
    if (canal) {
      for (const amostra of canal) {
        this.amostras.push(amostra);
        if (this.amostras.length >= sampleRate / 10) this.enviar();
      }
    }
    return true;
  }
}

registerProcessor("transcricao-pcm", TranscricaoProcessor);
