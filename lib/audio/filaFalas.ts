/**
 * Serializa as falas do candidato para o agente, um pedido por vez.
 *
 * - Pedaços que chegam enquanto um pedido está em voo viram UMA fala só (o VAD corta a fala em cada pausa de
 *   ~0,9 s; mandar cada pedaço como um turno deixaria a pergunta real esperando atrás deles).
 * - Falha não trava a conversa: tenta de novo uma vez sozinha; se falhar outra vez, avisa (`aoErro`) e segue
 *   com as próximas falas. A fala que falhou fica guardada para `tentarNovamente`.
 */
export class FilaFalas {
  private pendente: string | null = null;
  private falhou: string | null = null;
  private ocupada = false;
  private versao = 0;

  constructor(
    private enviar: (texto: string) => Promise<void>,
    private aoErro: (texto: string) => void,
    private esperaDoRetryMs = 800,
  ) {}

  adicionar(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;
    this.pendente = this.pendente ? `${this.pendente} ${limpo}` : limpo;
    void this.processar();
  }

  /** Reenvia a última fala que falhou (o botão de último recurso). */
  tentarNovamente() {
    if (!this.falhou) return;
    const texto = this.falhou;
    this.falhou = null;
    this.adicionar(texto);
  }

  limpar() {
    this.versao++;
    this.pendente = this.falhou = null;
    this.ocupada = false;
  }

  private async processar() {
    if (this.ocupada) return;
    this.ocupada = true;
    const versao = this.versao;
    try {
      while (versao === this.versao && this.pendente) {
        const texto = this.pendente;
        this.pendente = null;
        const ok = await this.tentar(texto, versao);
        if (versao !== this.versao) return;
        if (!ok) {
          this.falhou = texto;
          this.aoErro(texto);
        }
      }
    } finally {
      if (versao === this.versao) this.ocupada = false;
    }
  }

  private async tentar(texto: string, versao: number): Promise<boolean> {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      try {
        await this.enviar(texto);
        return true;
      } catch {
        if (versao !== this.versao) return true;
        if (tentativa === 1) await new Promise((r) => setTimeout(r, this.esperaDoRetryMs));
      }
    }
    return false;
  }
}
