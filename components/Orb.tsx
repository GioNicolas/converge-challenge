"use client";

// O entrevistador na tela: uma pílula de vidro que muda de forma conforme o estado.
// Um corpo só: o tamanho anda com mola (passa um pouco do ponto e assenta, como uma gota)
// e o conteúdo troca com blur (o velho sai, depois o novo entra).
//   ouvindo  → três barras que seguem o volume do microfone
//   pensando → três bolinhas em órbita
//   falando  → cinco barras numa onda, na cor do agente
//   duvida   → a pílula cresce com o convite e pulsa; o clique é o plin
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export type EstadoOrb = "ouvindo" | "pensando" | "falando" | "duvida";

const TAMANHO: Record<EstadoOrb, [number, number]> = {
  ouvindo: [108, 40],
  pensando: [44, 44],
  falando: [120, 40],
  duvida: [196, 40],
};

const MOLA_GOTA = { type: "spring", stiffness: 420, damping: 20, mass: 0.8 } as const;
const ENTRADA = { duration: 0.32, ease: [0.2, 0.9, 0.25, 1], delay: 0.09 } as const;
const SAIDA = { duration: 0.11, ease: "easeIn" } as const;

type Props = {
  estado: EstadoOrb;
  /** 0 a 1: microfone (ouvindo) ou voz do agente (falando). */
  volume?: number;
  textoDuvida?: string;
  onClicarDuvida?: () => void;
};

export default function Orb({
  estado,
  volume = 0,
  textoDuvida = "Tenho uma pergunta",
  onClicarDuvida,
}: Props) {
  const reduzido = useReducedMotion() ?? false;
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const [largura, altura] = TAMANHO[estado];
  const duvida = estado === "duvida";

  return (
    // Entrada (uma vez só): desce como uma gota, passa do ponto achatando e assenta.
    <motion.div
      initial={
        reduzido ? { opacity: 0 } : { opacity: 0, y: -36, scaleX: 0.5, scaleY: 0.62, filter: "blur(10px)" }
      }
      animate={
        reduzido
          ? { opacity: 1 }
          : {
              opacity: 1,
              y: [-36, 5, -3, 1, 0],
              scaleX: [0.5, 1.12, 0.95, 1.02, 1],
              scaleY: [0.62, 0.86, 1.07, 0.98, 1],
              filter: "blur(0px)",
            }
      }
      transition={{
        default: { duration: 0.9, times: [0, 0.42, 0.64, 0.82, 1] },
        opacity: { duration: 0.3 },
        filter: { duration: 0.4 },
      }}
    >
      <motion.button
        type="button"
        disabled={!duvida}
        onClick={duvida ? onClicarDuvida : undefined}
        aria-label={duvida ? textoDuvida : "Entrevistador"}
        initial={false}
        animate={{ width: largura, height: altura, borderRadius: altura / 2 }}
        transition={
          reduzido
            ? { duration: 0 }
            : { width: MOLA_GOTA, height: { ...MOLA_GOTA, stiffness: 360 }, borderRadius: MOLA_GOTA }
        }
        whileTap={duvida ? { scale: 0.96 } : undefined}
        className={`relative overflow-hidden border border-white/18 bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,.35),inset_0_1px_0_rgba(255,255,255,.22)] backdrop-blur-2xl backdrop-saturate-150 ${
          duvida ? "cursor-pointer border-agente/70" : "cursor-default"
        }`}
      >
        {duvida && !reduzido && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            animate={{
              boxShadow: [
                "0 0 0 0px rgba(0,113,227,0)",
                "0 0 0 6px rgba(0,113,227,.28)",
                "0 0 0 0px rgba(0,113,227,0)",
              ],
            }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={estado}
            initial={{ opacity: 0, filter: "blur(10px)", scale: 0.94 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: ENTRADA }}
            exit={{ opacity: 0, filter: "blur(8px)", scale: 1.04, transition: SAIDA }}
            className="absolute inset-0 flex items-center justify-center"
          >
            {estado === "ouvindo" && <Barras quantidade={3} volumeRef={volumeRef} reduzido={reduzido} />}
            {estado === "falando" && <Barras quantidade={5} volumeRef={volumeRef} reduzido={reduzido} onda />}
            {estado === "pensando" && <Orbita reduzido={reduzido} />}
            {duvida && (
              <span className="flex items-center gap-2.5 px-4 text-[13px] font-medium whitespace-nowrap text-white">
                <span className="relative size-2.5 shrink-0 rounded-full bg-agente">
                  {!reduzido && (
                    <motion.span
                      className="absolute -inset-[5px] rounded-full border-2 border-agente"
                      animate={{ scale: [0.6, 1.9], opacity: [0.9, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                </span>
                {textoDuvida}
              </span>
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}

/**
 * Barras verticais que vibram com a voz. As alturas mudam direto no DOM a cada quadro (sem re-render).
 * onda: a vibração anda de uma barra para a outra e, sem volume, a fala se mexe sozinha.
 */
function Barras({
  quantidade,
  volumeRef,
  reduzido,
  onda = false,
}: {
  quantidade: number;
  volumeRef: React.RefObject<number>;
  reduzido: boolean;
  onda?: boolean;
}) {
  const barras = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    let vol = 0;
    const t0 = performance.now();
    const quadro = (ts: number) => {
      const t = (ts - t0) / 1000;
      let alvo = volumeRef.current ?? 0;
      if (onda && alvo < 0.05) alvo = 0.45 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 1.7);
      vol += (alvo - vol) * 0.3;
      barras.current.forEach((b, i) => {
        if (!b) return;
        const meio = 1 - Math.abs(i - (quantidade - 1) / 2) / quantidade; // barras do meio mais altas
        const vibra = reduzido
          ? 0.7
          : onda
            ? 0.55 + 0.45 * Math.sin(t * 9 - i * 0.9)
            : 0.62 + 0.38 * Math.sin(t * 15 + i * 2.1);
        b.style.height = `${(8 + vol * vibra * 24 * meio).toFixed(1)}px`;
      });
      raf = requestAnimationFrame(quadro);
    };
    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
  }, [quantidade, volumeRef, reduzido, onda]);

  return (
    <span className={`flex items-center ${onda ? "gap-[5px]" : "gap-[7px]"}`}>
      {Array.from({ length: quantidade }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barras.current[i] = el;
          }}
          className={`block h-2 rounded-full ${onda ? "w-1.5 bg-[color-mix(in_srgb,var(--agente)_35%,white)]" : "w-[7px] bg-white/95"}`}
        />
      ))}
    </span>
  );
}

/** Três bolinhas em órbita: o "pensando". */
function Orbita({ reduzido }: { reduzido: boolean }) {
  return (
    <motion.span
      className="relative block size-[26px]"
      animate={reduzido ? undefined : { rotate: 360 }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute top-1/2 left-1/2 block size-[9px] rounded-full bg-white/95"
          style={{
            transform: `translate(-50%, -50%) rotate(${i * 120}deg) translateY(-9px)`,
          }}
        />
      ))}
    </motion.span>
  );
}
