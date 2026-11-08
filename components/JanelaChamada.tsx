"use client";

// Chamada em andamento, sempre minimizada numa pílula (estilo Meet): o agente "vivo" como uma onda de voz,
// o tempo e o microfone. A fala é transcrita para a conversa e para a linha do tempo.
// Arrasta e encaixa no canto mais próximo, com mola.
import { useCallback, useEffect, useRef, useState } from "react";
import { animate, motion, useDragControls, useMotionValue } from "motion/react";
import Icone from "@/components/Icone";
import OndaDeVoz from "@/components/agente/OndaDeVoz";
import type { EstadoAgente } from "@/lib/presenca/energia";
import type { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";

const MOLA = { type: "spring", stiffness: 400, damping: 34 } as const;
const MARGEM = 16;
const TOPO_LIVRE = 16;
const BASE_LIVRE = 16;

type Canto = "inferior-direito" | "inferior-esquerdo" | "superior-direito" | "superior-esquerdo";

function formatarTempo(segundos: number) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCronometro(iniciadaEm: number | null, ativo: boolean) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ativo]);
  return iniciadaEm === null ? 0 : Math.max(0, Math.floor((agora - iniciadaEm) / 1000));
}

type Props = {
  /** A conversa está aberta na barra lateral: a pílula sai da frente. */
  oculta: boolean;
  /** A entrevista acabou (para o tempo). */
  encerrada: boolean;
  iniciadaEm: number | null;
  midia: ReturnType<typeof useMidiaLocal>;
  agenteFalando: boolean;
  /** Uma resposta está sendo preparada: o orbe mostra que o agente pensa. */
  agentePensando?: boolean;
};

export default function JanelaChamada({ oculta, encerrada, iniciadaEm, midia, agenteFalando, agentePensando = false }: Props) {
  const ativa = iniciadaEm !== null && !encerrada;
  const segundos = useCronometro(iniciadaEm, ativa);
  const estadoAgente: EstadoAgente = agenteFalando ? "falando" : agentePensando ? "pensando" : "ouvindo";

  // --- Arrastar e encaixar no canto ---
  const caixa = useRef<HTMLDivElement>(null);
  const controles = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const canto = useRef<Canto>("inferior-direito");

  const encaixar = useCallback(
    (alvo: Canto, comMola = true) => {
      const el = caixa.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const esquerda = alvo.endsWith("esquerdo") ? MARGEM : innerWidth - MARGEM - r.width;
      const topo = alvo.startsWith("superior") ? TOPO_LIVRE : innerHeight - BASE_LIVRE - r.height;
      const nx = x.get() + (esquerda - r.left);
      const ny = y.get() + (topo - r.top);
      canto.current = alvo;
      if (comMola) {
        animate(x, nx, MOLA);
        animate(y, ny, MOLA);
      } else {
        x.set(nx);
        y.set(ny);
      }
    },
    [x, y],
  );

  function aoSoltar() {
    const el = caixa.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vertical = r.top + r.height / 2 < innerHeight / 2 ? "superior" : "inferior";
    const lado = r.left + r.width / 2 < innerWidth / 2 ? "esquerdo" : "direito";
    encaixar(`${vertical}-${lado}` as Canto);
  }

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new ResizeObserver(() => encaixar(canto.current));
    observador.observe(el);
    const aoRedimensionar = () => encaixar(canto.current, false);
    addEventListener("resize", aoRedimensionar);
    return () => {
      observador.disconnect();
      removeEventListener("resize", aoRedimensionar);
    };
  }, [encaixar]);

  function comecarArraste(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return; // o botão do microfone continua clicável
    controles.start(e);
  }

  return (
    <motion.div
      ref={caixa}
      data-janela-chamada
      drag
      dragControls={controles}
      dragListener={false}
      dragMomentum={false}
      onDragEnd={aoSoltar}
      onPointerDown={comecarArraste}
      style={{ x, y }}
      animate={{ opacity: oculta ? 0 : 1, scale: oculta ? 0.92 : 1 }}
      transition={{ duration: 0.2 }}
      aria-hidden={oculta}
      className={`fixed right-4 bottom-4 z-10 touch-none select-none ${oculta ? "pointer-events-none" : "pointer-events-auto"}`}
    >
      <div
        role="status"
        aria-label="Chamada com o entrevistador"
        className="flex h-11 cursor-grab items-center gap-2.5 rounded-full bg-vidro-escuro pr-1.5 pl-2 text-sm text-texto-claro shadow-flutuante backdrop-blur-xl active:cursor-grabbing"
      >
        <OndaDeVoz estado={estadoAgente} volume={estadoAgente === "ouvindo" ? midia.volume : 0} tamanho="md" />
        <span className="font-medium tabular-nums">{formatarTempo(segundos)}</span>
        {agenteFalando && <span className="text-texto-claro/60">Falando…</span>}
        <button
          type="button"
          onClick={midia.alternarMicrofone}
          disabled={!midia.stream}
          aria-label={midia.microfoneLigado ? "Desligar microfone" : "Ligar microfone"}
          title={midia.microfoneLigado ? "Desligar microfone" : "Ligar microfone"}
          className={`flex size-8 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-suave active:scale-90 disabled:opacity-40 ${
            midia.microfoneLigado ? "bg-texto-claro/12 hover:bg-texto-claro/20" : "bg-perigo text-sobre-marca hover:bg-perigo/90"
          }`}
        >
          <Icone nome={midia.microfoneLigado ? "microfone" : "microfoneDesligado"} tamanho={16} />
        </button>
      </div>
    </motion.div>
  );
}
