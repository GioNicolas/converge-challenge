"use client";

// Enquanto o scorecard não existe: pede ao servidor (idempotente: se o fim da entrevista já pediu,
// junta-se ao mesmo pedido) e recarrega a página quando ficar pronto.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Perola from "@/components/totti/Perola";

const CURVA = [0.32, 0.72, 0, 1] as const;

/** O que o servidor de fato faz, nessa ordem. */
const ETAPAS = [
  "Lendo a linha do tempo da entrevista",
  "Relacionando falas e desenho com a rubrica",
  "Conferindo cada prova na gravação",
  "Escrevendo o relatório",
];

export default function GerandoRelatorio({ sessaoId, area, problema }: { sessaoId: string; area: string; problema: string }) {
  const router = useRouter();
  const reduzir = useReducedMotion();
  const [etapa, setEtapa] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const tentativa = useRef(0);

  const gerar = useCallback(async (reiniciarAnimacao = true) => {
    const minha = ++tentativa.current;
    setErro(null);
    if (reiniciarAnimacao) setEtapa(0);
    try {
      const r = await fetch(`/api/sessoes/${encodeURIComponent(sessaoId)}/finalizar`, { method: "POST" });
      if (minha !== tentativa.current) return;
      if (r.status === 202) {
        window.setTimeout(() => { if (minha === tentativa.current) void gerar(false); }, 3000);
        return;
      }
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
        setErro(corpo?.erro ?? "Não foi possível gerar o relatório agora.");
        return;
      }
      router.refresh();
    } catch {
      if (minha === tentativa.current) setErro("Sem conexão com o servidor.");
    }
  }, [sessaoId, router]);

  useEffect(() => {
    void gerar();
  }, [gerar]);

  // Avança as etapas no ritmo típico da geração (para na última até o servidor responder).
  useEffect(() => {
    if (erro) return;
    const t = setInterval(() => setEtapa((e) => Math.min(e + 1, ETAPAS.length - 1)), 4500);
    return () => clearInterval(t);
  }, [erro]);

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-fundo px-6">
      <motion.div
        initial={reduzir ? false : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.48, ease: CURVA }}
        className="flex w-full max-w-md flex-col gap-6 rounded-padrao bg-superficie p-8 shadow-flutuante"
      >
        <div className="flex items-center gap-4">
          <Perola estado={erro ? "ocioso" : "pensando"} tamanho={44} />
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[12.5px] text-texto-suave">gerando relatório · entrevista de {area}</p>
            <h1 className="titulo-display text-[26px]">{problema}</h1>
          </div>
        </div>

        {erro ? (
          <div className="flex flex-col gap-4">
            <p className="leading-relaxed text-texto-suave">{erro}</p>
            <button
              onClick={() => void gerar()}
              className="w-fit rounded-full bg-marca px-5 py-2.5 font-medium text-sobre-marca outline-none transition-[opacity,transform] duration-150 ease-suave hover:opacity-90 focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <>
          <p className="-mt-3 text-[12px] text-texto-suave">A análise pode levar alguns minutos.</p>
          <ol className="flex flex-col gap-3" aria-live="polite">
            {ETAPAS.map((texto, i) => {
              const feita = i < etapa;
              const atual = i === etapa;
              return (
                <li key={texto} className="flex items-center gap-3">
                  <span className="relative flex size-4 shrink-0 items-center justify-center">
                    <AnimatePresence initial={false}>
                      {feita ? (
                        <motion.svg
                          key="feita"
                          viewBox="0 0 16 16"
                          className="absolute size-4 text-sucesso"
                          initial={{ opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.28, ease: CURVA }}
                          aria-hidden
                        >
                          <motion.path
                            d="M3.5 8.5 6.5 11.5 12.5 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.75}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: reduzir ? 1 : 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 0.36, ease: CURVA }}
                          />
                        </motion.svg>
                      ) : (
                        <motion.span
                          key="ponto"
                          exit={{ opacity: 0, scale: 0.4 }}
                          className={`size-2 rounded-full ${atual ? "bg-marca" : "bg-superficie-2"}`}
                          animate={atual && !reduzir ? { scale: [1, 1.5, 1], opacity: [1, 0.6, 1] } : { scale: 1 }}
                          transition={atual ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
                        />
                      )}
                    </AnimatePresence>
                  </span>
                  <span
                    className={`transition-colors duration-300 ease-suave ${atual ? "text-texto" : "text-texto-suave"}`}
                  >
                    {texto}
                  </span>
                </li>
              );
            })}
          </ol>
          </>
        )}
        <p className="text-xs leading-relaxed text-texto-suave">
          Toda nota precisa de uma prova da sessão; o que não tiver prova fica sem nota.
        </p>
      </motion.div>
    </main>
  );
}
