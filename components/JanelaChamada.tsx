"use client";

// Chamada em andamento, sempre minimizada numa pílula (estilo Meet): o agente "vivo" como uma onda de voz,
// o tempo e o microfone. A fala é transcrita para a conversa e para a linha do tempo.
// Quando o agente tem uma pergunta, a pílula mostra o balão; clicar abre a
// conversa na barra lateral.
// Arrasta e encaixa no canto mais próximo, com mola.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "motion/react";
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
  /** Assunto da pergunta esperando o clique ("Quero entender o loop interno"): mostra a bolha e deixa o agente azul. */
  pergunta: string | null;
  /** A conversa está aberta na barra lateral: a pílula sai da frente. */
  oculta: boolean;
  /** A entrevista acabou (para o tempo). */
  encerrada: boolean;
  iniciadaEm: number | null;
  midia: ReturnType<typeof useMidiaLocal>;
  agenteFalando: boolean;
  onClicarPlin: () => void;
  /** "Agora não": tira a pergunta da tela sem abrir a conversa. */
  onAdiar: () => void;
};

export default function JanelaChamada({ pergunta, oculta, encerrada, iniciadaEm, midia, agenteFalando, onClicarPlin, onAdiar }: Props) {
  const duvidaPendente = pergunta !== null;
  const ativa = iniciadaEm !== null && !encerrada;
  const segundos = useCronometro(iniciadaEm, ativa);
  const estadoAgente: EstadoAgente = duvidaPendente ? "duvida" : agenteFalando ? "falando" : "ouvindo";

  // --- Arrastar e encaixar no canto ---
  const caixa = useRef<HTMLDivElement>(null);
  const controles = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const canto = useRef<Canto>("inferior-direito");
  const [emCima, setEmCima] = useState(false);

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
      setEmCima(alvo.startsWith("superior"));
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
      <BolhaDaPergunta pergunta={pergunta} emCima={emCima} onClicar={onClicarPlin} onAdiar={onAdiar} />
      <div
        role="status"
        aria-label="Chamada com o entrevistador"
        className="flex h-11 cursor-grab items-center gap-2.5 rounded-full bg-vidro-escuro pr-1.5 pl-2 text-sm text-texto-claro shadow-flutuante backdrop-blur-xl active:cursor-grabbing"
      >
        <OndaDeVoz estado={estadoAgente} volume={estadoAgente === "ouvindo" ? midia.volume : 0} tamanho="md" />
        <span className="font-medium tabular-nums">{formatarTempo(segundos)}</span>
        {agenteFalando && !duvidaPendente && <span className="text-texto-claro/60">Falando…</span>}
        <button
          type="button"
          onClick={midia.alternarMicrofone}
          disabled={!midia.stream}
          aria-label={midia.microfoneLigado ? "Desligar microfone" : "Ligar microfone"}
          title={midia.microfoneLigado ? "Desligar microfone" : "Ligar microfone"}
          className={`flex size-8 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-suave active:scale-90 disabled:opacity-40 ${
            midia.microfoneLigado ? "bg-texto-claro/12 hover:bg-texto-claro/20" : "bg-perigo text-white hover:bg-perigo/90"
          }`}
        >
          <Icone nome={midia.microfoneLigado ? "microfone" : "microfoneDesligado"} tamanho={16} />
        </button>
      </div>
    </motion.div>
  );
}

/** O convite do plin: uma pílula no mesmo vidro escuro, acima (ou abaixo, se a chamada estiver no topo). */
function BolhaDaPergunta({
  pergunta,
  emCima,
  onClicar,
  onAdiar,
}: {
  pergunta: string | null;
  emCima: boolean;
  onClicar: () => void;
  onAdiar: () => void;
}) {
  return (
    <div
      className={`pointer-events-none absolute right-0 flex justify-end ${emCima ? "top-full pt-3" : "bottom-full pb-3"}`}
    >
      <AnimatePresence>
        {pergunta !== null && (
          <motion.div
            key={pergunta}
            initial={{ opacity: 0, y: emCima ? -8 : 8, scale: 0.9, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: emCima ? -6 : 6, scale: 0.94, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            style={{ transformOrigin: emCima ? "top right" : "bottom right" }}
            className="pointer-events-auto relative"
          >
            <motion.span
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="relative flex items-center gap-1 rounded-[18px] bg-vidro-escuro p-1.5 text-texto-claro shadow-flutuante ring-1 ring-white/10 backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={onClicar}
                aria-label={`Abrir a pergunta do entrevistador: ${pergunta}`}
                className="flex cursor-pointer items-center gap-3 rounded-[14px] py-1 pr-3 pl-1.5 text-left transition-colors duration-150 hover:bg-white/8"
              >
                <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-agente/20">
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-agente"
                    animate={{ scale: [1, 1.6], opacity: [0.7, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: [0.22, 1, 0.36, 1] }}
                  />
                  <span className="size-2.5 rounded-full bg-agente" />
                </span>
                <span className="flex flex-col leading-tight">
                  <span className="text-[13px] font-medium whitespace-nowrap">Tenho uma pergunta</span>
                  <span className="max-w-[240px] truncate text-[11px] text-texto-claro/55">{pergunta}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={onAdiar}
                className="rounded-[12px] px-2.5 py-2 text-[12px] font-medium whitespace-nowrap text-texto-claro/55 transition-colors duration-150 hover:bg-white/8 hover:text-texto-claro"
              >
                Agora não
              </button>
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
