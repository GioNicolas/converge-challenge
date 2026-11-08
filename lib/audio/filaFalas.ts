/** Serializa transcrições; falhas permanecem na fila até a pessoa tentar de novo. */
export class FilaFalas {
  private fila: string[] = [];
  private ocupada = false;
  private pausada = false;
  private versao = 0;

  constructor(private enviar: (texto: string) => Promise<void>, private aoErro: (texto: string) => void) {}

  adicionar(texto: string) {
    if (!texto.trim()) return;
    this.fila.push(texto.trim());
    void this.processar();
  }

  tentarNovamente() { this.pausada = false; void this.processar(); }

  limpar() {
    this.versao++;
    this.fila = [];
    this.ocupada = this.pausada = false;
  }

  private async processar() {
    if (this.ocupada || this.pausada) return;
    this.ocupada = true;
    const versao = this.versao;
    try {
      while (versao === this.versao && this.fila.length) {
        const texto = this.fila[0];
        try { await this.enviar(texto); }
        catch {
          if (versao === this.versao) {
            this.pausada = true;
            this.aoErro(texto);
          }
          return;
        }
        if (versao === this.versao) this.fila.shift();
      }
    } finally { if (versao === this.versao) this.ocupada = false; }
  }
}
