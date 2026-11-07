// Energia do agente: quanto ele "se mexe" em cada estado (0 a 1), igual para todas as aparências.
// Função pura do tempo, para cada visual só desenhar.
import { useEffect, useRef } from "react";

export type EstadoAgente = "ouvindo" | "pensando" | "falando" | "duvida";

/** Energia alvo num instante. `volume` é o microfone (ouvindo) ou a voz do agente (falando), de 0 a 1. */
export function energiaAlvo(estado: EstadoAgente, t: number, volume: number): number {
  const respiro = 0.1 + 0.05 * Math.sin(t * 1.1);
  switch (estado) {
    case "ouvindo":
      return Math.max(respiro, Math.min(1, volume * 2.2));
    case "falando":
      // Com voz real, segue o volume; sem, um ritmo de sílabas (dois senos que se cruzam).
      return volume > 0.02
        ? Math.min(1, 0.25 + volume)
        : 0.3 + 0.38 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 0.7));
    case "pensando":
      return 0.22 + 0.06 * Math.sin(t * 3.1);
    case "duvida":
      return 0.28 + 0.22 * Math.max(0, Math.sin(t * 2.4));
  }
}

/**
 * Laço de animação: chama `desenhar(energia, t, dt)` a cada quadro, com a energia suavizada.
 * O estado e o volume são lidos por ref (mudar não reinicia o laço).
 */
export function useLacoDeEnergia(
  estado: EstadoAgente,
  volume: number,
  desenhar: (energia: number, t: number, dt: number) => void,
  reduzido = false,
) {
  const estadoRef = useRef(estado);
  const volumeRef = useRef(volume);
  const desenharRef = useRef(desenhar);
  useEffect(() => {
    estadoRef.current = estado;
    volumeRef.current = volume;
    desenharRef.current = desenhar;
  });

  useEffect(() => {
    let raf = 0;
    let energia = 0;
    let anterior = performance.now();
    const quadro = (agora: number) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      const t = agora / 1000;
      const alvo = reduzido ? 0.15 : energiaAlvo(estadoRef.current, t, volumeRef.current);
      // Sobe rápido (resposta à voz) e desce mais devagar (não "pisca").
      const k = alvo > energia ? 14 : 5;
      energia += (alvo - energia) * Math.min(1, dt * k);
      desenharRef.current(energia, reduzido ? 0 : t, dt);
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [reduzido]);
}
