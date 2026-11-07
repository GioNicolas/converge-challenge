"use client";

// Página de comparação das aparências do agente (só para o time escolher; não é parte do produto).
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import VidroLiquido from "@/components/agente/VidroLiquido";
import OndaDeVoz from "@/components/agente/OndaDeVoz";
import AvatarChamada from "@/components/agente/AvatarChamada";
import OndaSiri from "@/components/agente/OndaSiri";
import type { EstadoAgente } from "@/lib/presenca/energia";

const ESTADOS: { valor: EstadoAgente; nome: string }[] = [
  { valor: "ouvindo", nome: "Ouvindo" },
  { valor: "falando", nome: "Falando" },
  { valor: "pensando", nome: "Pensando" },
  { valor: "duvida", nome: "Com dúvida" },
];

const VERSOES = [
  { letra: "A", nome: "Vidro líquido", descricao: "Uma gota de vidro que muda de forma devagar e refrata luz colorida.", C: VidroLiquido },
  { letra: "B", nome: "Onda de voz", descricao: "Um anel fino de luz que ondula com a fala.", C: OndaDeVoz },
  { letra: "C", nome: "Avatar de chamada", descricao: "Participante de câmera desligada, como no Meet, com anéis de voz.", C: AvatarChamada },
  { letra: "D", nome: "Onda colorida", descricao: "Ondas de luz que se somam sobre uma linha, como a Siri.", C: OndaSiri },
];

/** Volume do microfone (0 a 1), só quando ligado. */
function useMicrofone(ligado: boolean) {
  const [volume, setVolume] = useState(0);
  useEffect(() => {
    if (!ligado) return;
    let raf = 0;
    let stream: MediaStream | null = null;
    let contexto: AudioContext | null = null;
    let ativo = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      if (!ativo) return s.getTracks().forEach((t) => t.stop());
      stream = s;
      contexto = new AudioContext();
      const analisador = contexto.createAnalyser();
      analisador.fftSize = 512;
      contexto.createMediaStreamSource(s).connect(analisador);
      const amostras = new Float32Array(analisador.fftSize);
      const medir = () => {
        analisador.getFloatTimeDomainData(amostras);
        let soma = 0;
        for (const a of amostras) soma += a * a;
        setVolume(Math.min(1, Math.sqrt(soma / amostras.length) * 6));
        raf = requestAnimationFrame(medir);
      };
      medir();
    });
    return () => {
      ativo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void contexto?.close();
      setVolume(0);
    };
  }, [ligado]);
  return volume;
}

export default function ComparacaoAgente() {
  const [estado, setEstado] = useState<EstadoAgente>("falando");
  const [micLigado, setMicLigado] = useState(false);
  const [simulado, setSimulado] = useState(0.3);
  const mic = useMicrofone(micLigado);
  const volume = estado === "ouvindo" ? (micLigado ? mic : simulado) : 0;

  return (
    <main className="min-h-dvh bg-fundo px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">Entrevistador</p>
            <h1 className="text-3xl font-semibold tracking-tight">Como o agente aparece na chamada</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de estado com indicador deslizante */}
            <div className="relative flex rounded-full bg-superficie p-1 shadow-padrao">
              {ESTADOS.map((e) => (
                <button
                  key={e.valor}
                  onClick={() => setEstado(e.valor)}
                  className="relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-200"
                  style={{ color: estado === e.valor ? "white" : undefined }}
                >
                  {estado === e.valor && (
                    <motion.span
                      layoutId="indicador-estado"
                      className="absolute inset-0 -z-10 rounded-full bg-texto"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  {e.nome}
                </button>
              ))}
            </div>

            <button
              onClick={() => setMicLigado((v) => !v)}
              className={`rounded-full px-4 py-2 text-sm font-medium shadow-padrao transition-colors duration-200 ${
                micLigado ? "bg-marca text-white" : "bg-superficie text-texto"
              }`}
            >
              {micLigado ? "Microfone ligado" : "Usar meu microfone"}
            </button>

            {!micLigado && (
              <label className="flex items-center gap-2 rounded-full bg-superficie px-4 py-2 text-sm text-texto-suave shadow-padrao">
                Volume
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={simulado}
                  onChange={(e) => setSimulado(Number(e.target.value))}
                  className="w-28 accent-[var(--marca)]"
                />
              </label>
            )}
          </div>
        </header>

        <p className="-mt-4 text-sm text-texto-suave">
          O volume vale para o “Ouvindo”. Falando, pensando e com dúvida animam sozinhos. Todas as versões usam a mesma
          energia, para a comparação ser justa.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {VERSOES.map(({ letra, nome, descricao, C }) => (
            <section key={letra} className="flex flex-col gap-4 rounded-padrao bg-superficie p-5 shadow-padrao">
              <div className="flex items-baseline gap-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-texto text-sm font-semibold text-white">
                  {letra}
                </span>
                <div>
                  <h2 className="font-semibold tracking-tight">{nome}</h2>
                  <p className="text-sm text-texto-suave">{descricao}</p>
                </div>
              </div>

              {/* O mesmo quadro escuro da janela de chamada */}
              <div className="rounded-[20px] bg-[#1c1c1e] p-2 shadow-flutuante">
                <div className="relative flex h-[200px] items-center justify-center overflow-hidden rounded-[14px] bg-[radial-gradient(120%_90%_at_50%_0%,#2a2a2e,#131315)]">
                  <C estado={estado} volume={volume} />

                  <span className="absolute bottom-2.5 left-3 text-[11px] font-medium text-white/70">Entrevistador</span>
                  <AnimatePresence>
                    {estado === "duvida" && (
                      <motion.span
                        initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: 4, filter: "blur(4px)" }}
                        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                        className="absolute bottom-2.5 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-[12px] font-medium text-[#1c1c1e] shadow-padrao"
                      >
                        Tenho uma pergunta
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
