type Tipo = "entrada" | "saida";
type Dono = { tipo: Tipo; cancelar: () => void };

/** Uma única fonte de áudio por página: o microfone interrompe a reprodução. */
export class FocoAudio {
  private dono: Dono | null = null;
  private ouvintes = new Set<() => void>();

  private avisar() { for (const ouvir of [...this.ouvintes]) ouvir(); }

  assumir(tipo: Tipo, cancelar: () => void): () => void {
    if (tipo === "saida" && this.dono?.tipo === "entrada") {
      throw new Error("Aguarde o fim do ditado antes de reproduzir áudio.");
    }
    const anterior = this.dono;
    this.dono = null;
    anterior?.cancelar();
    const dono = { tipo, cancelar };
    this.dono = dono;
    this.avisar();
    return () => {
      if (this.dono !== dono) return;
      this.dono = null;
      this.avisar();
    };
  }

  async aguardarMicrofone(sinal: AbortSignal): Promise<void> {
    sinal.throwIfAborted();
    if (this.dono?.tipo !== "entrada") return;
    await new Promise<void>((resolve, reject) => {
      const limpar = () => {
        this.ouvintes.delete(verificar);
        sinal.removeEventListener("abort", cancelar);
      };
      const cancelar = () => { limpar(); reject(sinal.reason); };
      const verificar = () => {
        if (this.dono?.tipo === "entrada") return;
        limpar();
        resolve();
      };
      this.ouvintes.add(verificar);
      sinal.addEventListener("abort", cancelar, { once: true });
    });
    sinal.throwIfAborted();
  }
}

export const focoAudio = new FocoAudio();
