/**
 * Serializa as falas do candidato para o agente, um pedido por vez.
 *
 * - Fala que chega antes de o candidato ouvir a resposta da anterior SUBSTITUI a anterior: o pedido em voo é
 *   cancelado (ou a resposta pronta, ainda não tocada, é descartada) e as duas partes vão juntas num pedido só.
 *   Sem isso, a resposta da primeira metade começava a tocar e a da segunda a cortava no meio ("começa a falar
 *   uma coisa e muda para outra").
 * - Falha não trava a conversa: tenta de novo uma vez sozinha; se falhar outra vez, avisa (`aoErro`) e segue
 *   com as próximas falas. A fala que falhou fica guardada para `tentarNovamente`.
 */
export type OpcoesFilaFalas = {
  esperaDoRetryMs?: number;
  /** A resposta à última fala enviada ainda não começou a tocar (está sendo preparada ou esperando a vez). */
  respostaNaoOuvida?: () => boolean;
  /** Descarta essa resposta (ela não vai tocar: a fala nova a substitui). */
  descartarResposta?: () => void;
};

const juntar = (...partes: (string | null)[]) => partes.filter((p): p is string => !!p).join(" ");

export class FilaFalas {
  private pendente: string | null = null;
  private falhou: string | null = null;
  private ocupada = false;
  private versao = 0;
  private emVoo: { texto: string; controle: AbortController } | null = null;
  /** A última fala enviada com sucesso (a base da junção se a resposta dela ainda não foi ouvida). */
  private ultimaEnviada: string | null = null;
  /** O texto pendente inclui uma fala já enviada (o servidor deve trocá-la, não somar). */
  private substitui = false;
  private esperaDoRetryMs: number;

  constructor(
    private enviar: (texto: string, sinal: AbortSignal, opcoes: { substitui: boolean }) => Promise<void>,
    private aoErro: (texto: string) => void,
    private opcoes: OpcoesFilaFalas = {},
  ) {
    this.esperaDoRetryMs = opcoes.esperaDoRetryMs ?? 800;
  }

  adicionar(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;
    if (this.emVoo) {
      // O pedido em voo ainda não respondeu: cancela e manda tudo junto.
      const anterior = this.emVoo;
      this.emVoo = null;
      anterior.controle.abort();
      this.pendente = juntar(anterior.texto, this.pendente, limpo);
      this.substitui = true;
    } else if (!this.pendente && this.ultimaEnviada && this.opcoes.respostaNaoOuvida?.()) {
      // A resposta chegou mas ainda não tocou: ninguém a ouviu, então ela sai e a fala vai inteira.
      this.opcoes.descartarResposta?.();
      this.pendente = juntar(this.ultimaEnviada, limpo);
      this.substitui = true;
    } else {
      this.pendente = juntar(this.pendente, limpo);
    }
    this.ultimaEnviada = null;
    void this.processar();
  }

  /** Há fala pendente ou um pedido em voo. */
  get emAndamento(): boolean {
    return this.ocupada || this.pendente !== null;
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
    this.emVoo?.controle.abort();
    this.emVoo = null;
    this.pendente = this.falhou = this.ultimaEnviada = null;
    this.substitui = false;
    this.ocupada = false;
  }

  private async processar() {
    if (this.ocupada) return;
    this.ocupada = true;
    const versao = this.versao;
    try {
      while (versao === this.versao && this.pendente) {
        const texto = this.pendente;
        const substitui = this.substitui;
        this.pendente = null;
        this.substitui = false;
        const resultado = await this.tentar(texto, versao, substitui);
        if (versao !== this.versao) return;
        if (resultado === "ok") this.ultimaEnviada = texto;
        else if (resultado === "falhou") {
          this.falhou = texto;
          this.aoErro(texto);
        }
        // "substituida": a fala nova já está em `pendente` com este texto junto; o laço segue com ela.
      }
    } finally {
      if (versao === this.versao) this.ocupada = false;
    }
  }

  private async tentar(texto: string, versao: number, substitui: boolean): Promise<"ok" | "falhou" | "substituida"> {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const controle = new AbortController();
      this.emVoo = { texto, controle };
      try {
        // Um pedido cancelado pode ter chegado ao servidor: o reenvio também troca a fala, não soma.
        await this.enviar(texto, controle.signal, { substitui: substitui || tentativa > 1 });
        return controle.signal.aborted ? "substituida" : "ok";
      } catch {
        if (controle.signal.aborted || versao !== this.versao) return "substituida";
        if (tentativa === 1) await new Promise((r) => setTimeout(r, this.esperaDoRetryMs));
        if (controle.signal.aborted || versao !== this.versao) return "substituida";
      } finally {
        if (this.emVoo?.controle === controle) this.emVoo = null;
      }
    }
    return "falhou";
  }
}
