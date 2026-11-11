type DependenciasMedidor = {
  agora?: () => number;
  agendar?: (callback: () => void) => ReturnType<typeof setInterval>;
  cancelar?: (timer: ReturnType<typeof setInterval>) => void;
  enviar: (corpo: string, final: boolean) => void;
};

export function criarMedidorUsoTranscricao(sessaoId: string, dependencias: DependenciasMedidor) {
  const agora = dependencias.agora ?? Date.now;
  const inicio = agora();
  let finalizado = false;
  const enviar = (final: boolean) => {
    if (final && finalizado) return;
    if (final) finalizado = true;
    const sessaoS = (agora() - inicio) / 1000;
    const corpo = JSON.stringify({ sessao_id: sessaoId, contexto: "pre", tipo: "transcricao_uso", dados: { contexto: "pre", escuta_id: `pre-${inicio}`, audioEnviadoS: sessaoS, sessaoS, conexoes: 1, reconexoes: 0, final } });
    dependencias.enviar(corpo, final);
  };
  const agendar = dependencias.agendar ?? ((callback: () => void) => setInterval(callback, 60_000));
  const timer = agendar(() => enviar(false));
  return {
    finalizar() {
      (dependencias.cancelar ?? clearInterval)(timer);
      enviar(true);
    },
  };
}
