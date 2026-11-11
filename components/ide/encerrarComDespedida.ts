export const TEMPO_MAXIMO_DESPEDIDA_MS = 12_000;
export const MS_POR_CARACTERE_DESPEDIDA = 70;
export const TEMPO_LEGENDA_DESPEDIDA_MS = 4_000;

export type EncerramentoDeps = {
  dizer: (texto: string) => Promise<boolean>;
  registrarFala: (texto: string) => Promise<void>;
  endSession: (motivo: "button" | "timeout") => void | Promise<void>;
  navegar: () => void;
  pedirEncerramento: () => Promise<string | undefined>;
  mostrarTexto: (texto: string, duracaoMs: number) => Promise<void>;
  reserva: string;
  esperar?: (ms: number) => Promise<void>;
  tetoMs?: number;
};

/** Cria um encerramento idempotente que registra a fala antes de fechar a sessão. */
export function criarEncerrarComDespedida(deps: EncerramentoDeps) {
  let emCurso = false;
  return async (motivo: "button" | "timeout", despedida?: string): Promise<void> => {
    if (emCurso) return;
    emCurso = true;
    const texto = despedida ?? await deps.pedirEncerramento().catch(() => undefined) ?? deps.reserva;
    await deps.registrarFala(texto);
    const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tocou = false;
    try {
      const resultado = await Promise.race([
        deps.dizer(texto).then((ok) => { tocou = ok; return "audio" as const; }, () => "erro" as const),
        new Promise<"teto">((resolve) => { timer = setTimeout(() => resolve("teto"), deps.tetoMs ?? TEMPO_MAXIMO_DESPEDIDA_MS + texto.length * MS_POR_CARACTERE_DESPEDIDA); }),
      ]);
      if (resultado !== "audio" || !tocou) await deps.mostrarTexto(texto, TEMPO_LEGENDA_DESPEDIDA_MS);
    } finally {
      if (timer) clearTimeout(timer);
    }
    await esperar(0);
    await deps.endSession(motivo);
    deps.navegar();
  };
}
