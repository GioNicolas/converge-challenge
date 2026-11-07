"use client";

// Janela de chamada (estilo Google Meet, no canto da tela).
// - Dois participantes lado a lado: o Entrevistador (orb que reage à voz) e Você (câmera só local).
// - Quem está falando ganha a borda azul, como no Meet. Na dúvida, o quadro do agente chama o clique.
// - Tempo e fase, microfone, câmera, minimizar e encerrar.
// - Arrasta e encaixa no canto mais próximo, com mola. Minimiza numa pílula.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "motion/react";
import Icone from "@/components/Icone";
import type { EstadoAgente } from "@/components/AgenteOrb";
import type { Fase } from "@/lib/sessao/cliente";
import type { EstadoEntrevista } from "@/lib/sessao/estados";
import type { useMidiaLocal } from "@/lib/presenca/useMidiaLocal";

// WebGL só no navegador.
const AgenteOrb = dynamic(() => import("@/components/AgenteOrb"), { ssr: false });

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
const FALANDO = 0.08; // volume do microfone a partir do qual o candidato "está falando"

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
  const candidatoFalando = midia.microfoneLigado && midia.volume > FALANDO && !agenteFalando;

  const estadoAgente: EstadoAgente = temDuvida ? "duvida" : agenteFalando ? "falando" : "ouvindo";

  // O orb lê o volume do microfone a cada quadro, sem re-render.
  const volumeMicrofone = useRef(0);
  useEffect(() => {
    volumeMicrofone.current = midia.volume;
  }, [midia.volume]);

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
  }, [midia.stream, minimizada, midia.cameraLigada]);

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
              className="w-[392px] cursor-grab active:cursor-grabbing"
            >
              {/* Os dois participantes, lado a lado */}
              <div className="grid grid-cols-2 gap-2 p-2">
                <Participante
                  nome="Entrevistador"
                  falando={agenteFalando}
                  destaque={temDuvida}
                  onClick={temDuvida ? onClicarPlin : undefined}
                  rotulo={temDuvida ? "Ouvir a pergunta do entrevistador" : undefined}
                >
                  <AgenteOrb
                    estado={estadoAgente}
                    volumeEntrada={volumeMicrofone}
                    className="absolute inset-0 m-auto size-[118px]"
                  />
                  <AnimatePresence>
                    {temDuvida && (
                      <motion.span
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                        className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-full bg-agente py-1 text-[11px] font-medium text-white shadow-padrao"
                      >
                        Tenho uma pergunta
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Participante>

                <Participante nome="Você" falando={candidatoFalando} microfoneDesligado={!midia.microfoneLigado}>
                  {midia.stream && midia.cameraLigada ? (
                    <video ref={video} autoPlay muted playsInline className="h-full w-full -scale-x-100 object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <span className="flex size-14 items-center justify-center rounded-full bg-texto-claro/10 text-texto-claro/60">
                        <Icone nome="pessoa" tamanho={26} />
                      </span>
                    </div>
                  )}
                </Participante>
              </div>

              <AnimatePresence initial={false}>
                {estado.plin === "PERGUNTA_ATIVA" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
                    className="px-2"
                  >
                    <button
                      onClick={onTerminarResposta}
                      className="w-full rounded-full bg-texto-claro/12 py-2 text-sm font-medium transition-colors duration-150 ease-suave hover:bg-texto-claro/20"
                    >
                      Terminei de responder
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Barra da chamada */}
              <div className="flex items-center gap-2 px-3 pt-1 pb-2.5">
                <div className="mr-auto flex min-w-0 items-center gap-1.5 text-xs">
                  <span className={`size-1.5 shrink-0 rounded-full ${ativa ? "bg-sucesso" : "bg-texto-claro/30"}`} />
                  <span className="font-medium tabular-nums">{formatarTempo(segundos)}</span>
                  <span className="text-texto-claro/40">·</span>
                  <span className="truncate text-texto-claro/70">{NOME_DA_FASE[estado.fase]}</span>
                </div>
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
                    title="Encerrar entrevista"
                    className="flex h-9 w-14 items-center justify-center rounded-full bg-perigo text-white transition-[opacity,transform] duration-150 ease-suave hover:opacity-90 active:scale-95"
                  >
                    <Icone nome="desligar" />
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

/** Um quadro de participante: conteúdo, nome embaixo e a borda de quem está falando. */
function Participante({
  nome,
  falando,
  destaque = false,
  microfoneDesligado = false,
  onClick,
  rotulo,
  children,
}: {
  nome: string;
  falando: boolean;
  destaque?: boolean;
  microfoneDesligado?: boolean;
  onClick?: () => void;
  rotulo?: string;
  children: React.ReactNode;
}) {
  const Elemento = onClick ? motion.button : motion.div;
  return (
    <Elemento
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={rotulo}
      whileTap={onClick ? { scale: 0.97 } : undefined}
      animate={{
        boxShadow: destaque
          ? ["0 0 0 2px rgba(0,113,227,.9)", "0 0 0 5px rgba(0,113,227,.35)", "0 0 0 2px rgba(0,113,227,.9)"]
          : falando
            ? "0 0 0 2px rgba(0,113,227,.9)"
            : "0 0 0 0px rgba(0,113,227,0)",
      }}
      transition={destaque ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      className={`relative aspect-[4/3] overflow-hidden rounded-[14px] bg-black/30 ${onClick ? "cursor-pointer" : ""}`}
    >
      {children}
      <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-medium text-texto-claro/90 backdrop-blur-md">
        {microfoneDesligado && (
          <span className="text-perigo">
            <Icone nome="microfoneDesligado" tamanho={11} />
          </span>
        )}
        {nome}
      </span>
    </Elemento>
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
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 ease-suave active:scale-90 ${
        desligado ? "bg-perigo text-white hover:bg-perigo/90" : "bg-texto-claro/12 hover:bg-texto-claro/20"
      }`}
    >
      {children}
    </button>
  );
}
