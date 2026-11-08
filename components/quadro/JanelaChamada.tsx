"use client";

// Janela de chamada (estilo Meet/FaceTime, no canto da tela).
// - Quadro do agente com o orb; câmera do candidato pequena no canto (só local: não sai do navegador).
// - Tempo e fase, microfone, câmera, minimizar e Encerrar.
// - Arrasta e encaixa no canto mais próximo, com mola. Minimiza numa pílula.
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue } from "motion/react";
import Icone from "@/components/quadro/Icone";
import OndaDeVoz from "@/components/quadro/OndaDeVoz";
import type { EstadoAgente } from "@/lib/presenca/energia";
import type { useMidiaLocal } from "@/lib/presenca/useMidiaLocalQuadro";

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

// Componente de design, igual para todos os espaços de entrevista (quadro, código...):
// não conhece a máquina de estados de nenhum deles, só recebe o que mostrar.
type Props = {
  /** Nome da fase já pronto para exibir (ex.: "Aprofundamento"). */
  fase: string;
  /** O agente tem uma pergunta esperando o clique (mostra a bolha e deixa o agente azul). */
  duvidaPendente: boolean;
  /** O candidato está respondendo uma pergunta (mostra "Terminei de responder"). */
  respondendo: boolean;
  /** A entrevista acabou (para o tempo e some o botão de encerrar). */
  encerrada: boolean;
  /** Marcadores para testes automáticos (viram data-fase e data-plin), sem efeito visual. */
  marcadores?: { fase?: string; plin?: string };
  iniciadaEm: number | null;
  midia: ReturnType<typeof useMidiaLocal>;
  agenteFalando: boolean;
  onClicarPlin: () => void;
  onTerminarResposta: () => void;
  onEncerrar: () => void;
};

export default function JanelaChamada({
  fase,
  duvidaPendente,
  respondendo,
  encerrada,
  marcadores,
  iniciadaEm,
  midia,
  agenteFalando,
  onClicarPlin,
  onTerminarResposta,
  onEncerrar,
}: Props) {
  const [minimizada, setMinimizada] = useState(false);
  const ativa = iniciadaEm !== null && !encerrada;
  const segundos = useCronometro(iniciadaEm, ativa);
  const temDuvida = duvidaPendente;

  const estadoAgente: EstadoAgente = temDuvida ? "duvida" : agenteFalando ? "falando" : "ouvindo";

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
      // No canto superior direito ficam o quadro de requisitos e a conversa: a janela encaixa logo abaixo deles.
      const painel = alvo === "superior-direito" ? document.querySelector("[data-painel-direito]") : null;
      const topoDireito = painel ? painel.getBoundingClientRect().bottom + 12 : TOPO_LIVRE;
      const topo = alvo.startsWith("superior")
        ? Math.min(Math.max(TOPO_LIVRE, topoDireito), innerHeight - BASE_LIVRE - r.height)
        : innerHeight - BASE_LIVRE - r.height;
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
    // O quadro de requisitos cresce com itens novos: se a janela estiver embaixo dele, desce junto.
    const painel = document.querySelector("[data-painel-direito]");
    if (painel) observador.observe(painel);
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
      data-fase={marcadores?.fase}
      data-plin={marcadores?.plin}
      drag
      dragControls={controles}
      dragListener={false}
      dragMomentum={false}
      onDragEnd={aoSoltar}
      onPointerDown={comecarArraste}
      style={{ x, y }}
      className="pointer-events-auto fixed right-4 bottom-16 z-10 touch-none select-none"
    >
      <BolhaDaPergunta visivel={temDuvida} emCima={emCima} onClicar={onClicarPlin} />
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
              className="flex h-11 cursor-pointer items-center gap-2.5 pr-4 pl-2 text-sm"
            >
              {/* O agente continua "vivo" na pílula: o mesmo anel, pequeno */}
              <OndaDeVoz estado={estadoAgente} volume={estadoAgente === "ouvindo" ? midia.volume : 0} tamanho={32} />
              <span className="font-medium tabular-nums">{formatarTempo(segundos)}</span>
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
                  <span className="text-texto-claro/75">{fase}</span>
                </div>

                {/* O agente fica na parte livre do quadro, sem passar por baixo da câmera do candidato.
                    Na dúvida, a área inteira vira o botão da pergunta. */}
                <button
                  type="button"
                  disabled={!temDuvida}
                  onClick={temDuvida ? onClicarPlin : undefined}
                  aria-label={temDuvida ? "Ouvir a pergunta do entrevistador" : "Entrevistador"}
                  className={`absolute inset-0 flex items-center justify-center ${
                    temDuvida ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  <OndaDeVoz estado={estadoAgente} volume={estadoAgente === "ouvindo" ? midia.volume : 0} tamanho={124} />
                </button>

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

              {respondendo && (
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

/**
 * O convite do plin: uma pílula no mesmo vidro escuro da janela.
 * Fica acima da janela (ou abaixo, se a janela estiver num canto de cima) e flutua de leve.
 */
function BolhaDaPergunta({ visivel, emCima, onClicar }: { visivel: boolean; emCima: boolean; onClicar: () => void }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center ${
        emCima ? "top-full pt-3" : "bottom-full pb-3"
      }`}
    >
      <AnimatePresence>
        {visivel && (
          <motion.button
            type="button"
            onClick={onClicar}
            aria-label="Ouvir a pergunta do entrevistador"
            initial={{ opacity: 0, y: emCima ? -8 : 8, scale: 0.9, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: emCima ? -6 : 6, scale: 0.94, filter: "blur(4px)" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            style={{ transformOrigin: emCima ? "top center" : "bottom center" }}
            className="pointer-events-auto relative cursor-pointer"
          >
            {/* Flutua de leve, como quem espera a vez de falar */}
            <motion.span
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              className="relative flex items-center gap-3 rounded-[18px] bg-vidro-escuro py-2.5 pr-4 pl-3 text-left text-texto-claro shadow-flutuante ring-1 ring-white/10 backdrop-blur-xl"
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
                <span className="text-[11px] whitespace-nowrap text-texto-claro/55">Clique quando quiser ouvir</span>
              </span>
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
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
