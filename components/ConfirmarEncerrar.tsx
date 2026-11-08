"use client";

// Confirmação antes de encerrar a chamada: cobre a tela toda, com o quadro desfocado atrás.
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

type Props = {
  aberto: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
};

export default function ConfirmarEncerrar({ aberto, onCancelar, onConfirmar }: Props) {
  const continuar = useRef<HTMLButtonElement>(null);

  // Esc cancela; o foco começa em "Continuar" (o caminho seguro).
  useEffect(() => {
    if (!aberto) return;
    continuar.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    addEventListener("keydown", aoTeclar);
    return () => removeEventListener("keydown", aoTeclar);
  }, [aberto, onCancelar]);

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onCancelar}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 backdrop-blur-md"
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-encerrar"
            aria-describedby="texto-encerrar"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="flex w-full max-w-[380px] flex-col gap-2 rounded-padrao bg-superficie p-6 text-center shadow-flutuante"
          >
            <h2 id="titulo-encerrar" className="text-lg font-semibold tracking-tight">
              Encerrar a entrevista?
            </h2>
            <p id="texto-encerrar" className="text-sm leading-relaxed text-texto-suave">
              Tem certeza que deseja finalizar? Se o entrevistador ainda tiver alguma pergunta, ele faz antes de
              encerrar. Depois disso, não dá para voltar e o que você fez até aqui é enviado para avaliação.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                ref={continuar}
                onClick={onCancelar}
                className="flex-1 rounded-full bg-superficie-2 px-4 py-2.5 text-sm font-medium transition-[background-color,transform] duration-150 ease-suave outline-none hover:bg-borda focus-visible:ring-2 focus-visible:ring-marca active:scale-[0.98]"
              >
                Continuar entrevista
              </button>
              <button
                onClick={onConfirmar}
                className="flex-1 rounded-full bg-perigo px-4 py-2.5 text-sm font-medium text-sobre-marca transition-[opacity,transform] duration-150 ease-suave outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-perigo/50 active:scale-[0.98]"
              >
                Encerrar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
