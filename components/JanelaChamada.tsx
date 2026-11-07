"use client";

// Janela de chamada (estilo Meet/FaceTime, no canto da tela).
// - Quadro do agente com o orb; câmera do candidato pequena no canto (só local: não sai do navegador).
// - Tempo e fase, microfone, câmera, minimizar e Encerrar.
// - Arrasta e encaixa no canto mais próximo, com mola. Minimiza numa pílula.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "motion/react";
import Icone from "@/components/Icone";
import AgentePresenca, { type EstadoAgente } from "@/components/AgentePresenca";
import type { Fase } from "@/lib/sessao/cliente";
import type { EstadoEntrevista } from "@/lib/sessao/estados";
import type { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";

const NOME_DA_FASE: Record<Fase, string> = {
  AGUARDANDO: "Aguardando",
  APRESENTACAO: "Apresentação",
  REQUISITOS: "Requisitos",
  ALTO_NIVEL: "Visão geral",
  APROFUNDAMENTO: "Aprofundamento",
  FECHAMENTO: "Fechamento",
  ENCERRADA: "Encerrada",
};

const MOLA = { type: "spring", stiffness: 400, damping: 34 } as const;
const MARGEM = 16;
const TOPO_LIVRE = 76; // abaixo da barra de ferramentas do Excalidraw
const BASE_LIVRE = 64; // acima dos controles de zoom e ajuda do Excalidraw

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
  estado: EstadoEntrevista;
  iniciadaEm: number | null;
  midia: ReturnType<typeof useMidiaLocal>;
  agenteFalando: boolean;
  onClicarPlin: () => void;
  onTerminarResposta: () => void;
  onEncerrar: () => void;
};

export default function JanelaChamada({
  estado,
  iniciadaEm,
  midia,
  agenteFalando,
  onClicarPlin,
  onTerminarResposta,
  onEncerrar,
}: Props) {
  const [minimizada, setMinimizada] = useState(false);
  const ativa = iniciadaEm !== null && estado.fase !== "ENCERRADA";
  const segundos = useCronometro(iniciadaEm, ativa);
  const temDuvida = estado.plin === "PLIN_PENDENTE";

  const estadoAgente: EstadoAgente = temDuvida ? "duvida" : agenteFalando ? "falando" : "ouvindo";

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
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const vertical = cy < innerHeight / 2 ? "superior" : "inferior";
    const lado = cx < innerWidth / 2 ? "esquerdo" : "direito";
    encaixar(`${vertical}-${lado}` as Canto);
  }

  // Ao minimizar/expandir ou redimensionar a janela do navegador, continua no mesmo canto.
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
    // Botões continuam clicáveis: o arraste começa só fora deles.
    if ((e.target as HTMLElement).closest("button")) return;
    controles.start(e);
  }

  // --- Câmera local ---
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = midia.stream;
  }, [midia.stream, minimizada]);

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
      className="pointer-events-auto fixed right-4 bottom-16 z-10 touch-none select-none"
    >
      <motion.div
        layout
        transition={MOLA}
        style={{ borderRadius: minimizada ? 999 : 20 }}
        className="overflow-hidden bg-vidro-escuro text-texto-claro shadow-flutuante backdrop-blur-xl"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {minimizada ? (
            <motion.div
              key="pilula"
              role="button"
              tabIndex={0}
              aria-label="Abrir a janela da chamada"
              onTap={() => {
                setMinimizada(false);
                if (temDuvida) onClicarPlin();
              }}
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.18 }}
              className="flex h-11 cursor-pointer items-center gap-2.5 px-4 text-sm"
            >
              <span className={`size-2 rounded-full ${ativa ? "bg-sucesso" : "bg-texto-claro/30"}`} />
              <span className="font-medium tabular-nums">{formatarTempo(segundos)}</span>
              {temDuvida && (
                <span className="flex items-center gap-1.5 text-texto-claro/90">
                  <span className="size-2 animate-pulse rounded-full bg-agente" />
                  Pergunta
                </span>
              )}
              {agenteFalando && !temDuvida && <span className="text-texto-claro/60">Falando…</span>}
              <span className={midia.microfoneLigado ? "text-texto-claro/70" : "text-perigo"}>
                <Icone nome={midia.microfoneLigado ? "microfone" : "microfoneDesligado"} tamanho={15} />
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="janela"
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.18 }}
              className="w-[320px] cursor-grab active:cursor-grabbing"
            >
              {/* Quadro do agente */}
              <div className="relative m-2 mb-0 h-[176px] overflow-hidden rounded-[14px] bg-black/25">
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] backdrop-blur-md">
                  <span className={`size-1.5 rounded-full ${ativa ? "bg-sucesso" : "bg-texto-claro/30"}`} />
                  <span className="font-medium tabular-nums">{formatarTempo(segundos)}</span>
                  <span className="text-texto-claro/50">·</span>
                  <span className="text-texto-claro/75">{NOME_DA_FASE[estado.fase]}</span>
                </div>

                {/* O agente fica na parte livre do quadro, sem passar por baixo da câmera do candidato. */}
                <div className="absolute inset-y-0 left-0 right-[108px] flex items-center justify-center pb-3">
                  <AgentePresenca
                    estado={estadoAgente}
                    volume={estadoAgente === "ouvindo" ? midia.volume : 0}
                    onClicarDuvida={onClicarPlin}
                  />
                </div>

                <AnimatePresence>
                  {!temDuvida && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute bottom-2.5 left-3 text-[11px] font-medium text-texto-claro/70"
                    >
                      Entrevistador
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Câmera do candidato: só local */}
                <div className="absolute right-2 bottom-2 h-[72px] w-[96px] overflow-hidden rounded-[10px] bg-black/40 ring-1 ring-white/10">
                  {midia.stream && midia.cameraLigada ? (
                    <video ref={video} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-texto-claro/40">
                      <Icone nome="pessoa" tamanho={22} />
                    </div>
                  )}
                  {!midia.microfoneLigado && midia.stream && (
                    <span className="absolute top-1 right-1 rounded-full bg-perigo p-0.5 text-white">
                      <Icone nome="microfoneDesligado" tamanho={10} />
                    </span>
                  )}
                </div>
              </div>

              {estado.plin === "PERGUNTA_ATIVA" && (
                <div className="px-2 pt-2">
                  <button
                    onClick={onTerminarResposta}
                    className="w-full rounded-full bg-texto-claro/12 py-2 text-sm font-medium transition-colors duration-150 ease-suave hover:bg-texto-claro/20"
                  >
                    Terminei de responder
                  </button>
                </div>
              )}

              {/* Controles */}
              <div className="flex items-center gap-2 p-2.5">
                <BotaoRedondo
                  rotulo={midia.microfoneLigado ? "Desligar microfone" : "Ligar microfone"}
                  desligado={!midia.microfoneLigado}
                  onClick={midia.alternarMicrofone}
                >
                  <Icone nome={midia.microfoneLigado ? "microfone" : "microfoneDesligado"} />
                </BotaoRedondo>
                <BotaoRedondo
                  rotulo={midia.cameraLigada ? "Desligar câmera" : "Ligar câmera"}
                  desligado={!midia.cameraLigada}
                  onClick={midia.alternarCamera}
                >
                  <Icone nome={midia.cameraLigada ? "camera" : "cameraDesligada"} />
                </BotaoRedondo>
                <BotaoRedondo rotulo="Minimizar" onClick={() => setMinimizada(true)}>
                  <Icone nome="minimizar" />
                </BotaoRedondo>
                {ativa && (
                  <button
                    onClick={onEncerrar}
                    aria-label="Encerrar entrevista"
                    className="ml-auto flex h-9 items-center gap-1.5 rounded-full bg-perigo px-4 text-sm font-medium text-white transition-[opacity,transform] duration-150 ease-suave hover:opacity-90 active:scale-95"
                  >
                    <Icone nome="desligar" tamanho={16} />
                    Encerrar
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function BotaoRedondo({
  rotulo,
  desligado = false,
  onClick,
  children,
}: {
  rotulo: string;
  desligado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={`flex size-9 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-suave active:scale-90 ${
        desligado ? "bg-perigo text-white hover:bg-perigo/90" : "bg-texto-claro/12 hover:bg-texto-claro/20"
      }`}
    >
      {children}
    </button>
  );
}
