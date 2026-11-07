export type EstadoBolha = "listening" | "thinking" | "falando" | "duvida";

export type Bolha = {
  handleEvent(ev: { kind: string; [k: string]: unknown }): void;
  /** Volume de 0 a 1: no ouvindo segue o microfone; no falando, a voz do agente. */
  setVolume(level: number): void;
  mostrar(nome: EstadoBolha, dados?: { texto?: string; onClick?: () => void }): void;
  readonly state: string | null;
  destroy(): void;
};

export function mountBubble(shadowRoot: ShadowRoot, opcoes?: { embutida?: boolean }): Bolha;
