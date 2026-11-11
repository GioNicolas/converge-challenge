/** Espera compartilhável pelas salas: áudio até o fim, teto se travar e texto por pelo menos quatro segundos. */
export const TEMPO_TEXTO_DESPEDIDA_MS = 4_000;
export const tetoDaDespedida = (texto: string): number => 12_000 + texto.length * 70;

type Dependencias = {
  bloquear: (texto: string) => void;
  finalizar: () => void | Promise<void>;
  falar: (texto: string) => Promise<void>;
  pararVoz: () => void;
  concluir: () => void;
  aoErro?: (erro: unknown) => void;
  tetoMs?: number;
  textoMs?: number;
};

/** Todas as entradas (botão, voz, relógio) compartilham uma tarefa e uma única finalização. */
export function criarDespedida(deps: Dependencias): (texto: string) => Promise<void> {
  let tarefa: Promise<void> | null = null;
  return (texto) => {
    if (tarefa) return tarefa;
    // Síncrono: fecha a entrada antes que outra fala ou evento de tempo tente encerrar também.
    deps.bloquear(texto);
    tarefa = Promise.resolve().then(async () => {
      try { void Promise.resolve(deps.finalizar()).catch((erro) => deps.aoErro?.(erro)); }
      catch (erro) { deps.aoErro?.(erro); }
      let teto: ReturnType<typeof setTimeout> | undefined;
      let minimo: ReturnType<typeof setTimeout> | undefined;
      const leitura = new Promise<void>((resolve) => { minimo = setTimeout(resolve, deps.textoMs ?? TEMPO_TEXTO_DESPEDIDA_MS); });
      try {
        await Promise.all([
          leitura,
          Promise.race([
            Promise.resolve().then(() => deps.falar(texto)).catch((erro) => deps.aoErro?.(erro)),
            new Promise<void>((resolve) => { teto = setTimeout(resolve, deps.tetoMs ?? tetoDaDespedida(texto)); }),
          ]),
        ]);
      } finally {
        if (teto) clearTimeout(teto);
        if (minimo) clearTimeout(minimo);
        deps.pararVoz();
      }
      deps.concluir();
    });
    return tarefa;
  };
}
