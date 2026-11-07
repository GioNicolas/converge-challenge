"use client";

// Quadro de requisitos, no canto superior direito: só o que já foi combinado na conversa.
// Cada item entra deslizando, é digitado letra a letra e ganha um check desenhado no fim.
// Recolhe numa pílula com a contagem. Em cima, as fases da entrevista com o passo atual destacado.
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Fase } from "@/lib/sessao/cliente";
import type { Requisito } from "@/lib/sessao/requisitos";

const CURVA = [0.32, 0.72, 0, 1] as const; // --curva-suave
const MS_POR_LETRA = 32;

const PASSOS: { fase: Fase; nome: string }[] = [
  { fase: "REQUISITOS", nome: "Requisitos" },
  { fase: "ALTO_NIVEL", nome: "Visão geral" },
  { fase: "APROFUNDAMENTO", nome: "Aprofundamento" },
  { fase: "FECHAMENTO", nome: "Fechamento" },
];

/** Posição da fase nos passos: -1 antes de começar, PASSOS.length depois de encerrar. */
function indiceDaFase(fase: Fase) {
  if (fase === "ENCERRADA") return PASSOS.length;
  return PASSOS.findIndex((p) => p.fase === fase);
}

function nomeDaFase(fase: Fase) {
  if (fase === "ENCERRADA") return "Encerrada";
  if (fase === "AGUARDANDO" || fase === "APRESENTACAO") return "Apresentação";
  return PASSOS.find((p) => p.fase === fase)?.nome ?? "";
}

function contagem(n: number) {
  if (n === 0) return "Nenhum requisito";
  return n === 1 ? "1 requisito" : `${n} requisitos`;
}

/** Lê o raio dos tokens em px: o motion só corrige a distorção do canto arredondado com número. */
function useRaioDoToken() {
  const [raio, setRaio] = useState<number | undefined>(undefined);
  useEffect(() => {
    const valor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--raio"));
    if (!Number.isNaN(valor)) setRaio(valor);
  }, []);
  return raio;
}

type Props = {
  requisitos: Requisito[];
  fase: Fase;
};

export default function QuadroRequisitos({ requisitos, fase }: Props) {
  const reduzir = useReducedMotion() ?? false;
  const [recolhido, setRecolhido] = useState(false);
  // Itens que já terminaram de digitar: ao reabrir o quadro, não digitam de novo.
  const [prontos, setProntos] = useState<ReadonlySet<string>>(() => new Set());
  const raio = useRaioDoToken();
  const transicao = reduzir ? { duration: 0 } : { duration: 0.42, ease: CURVA };

  function marcarPronto(id: string) {
    setProntos((atual) => (atual.has(id) ? atual : new Set(atual).add(id)));
  }

  return (
    <motion.section
      layout
      transition={transicao}
      style={raio === undefined ? undefined : { borderRadius: raio }}
      aria-label="Requisitos combinados"
      className={`relative overflow-hidden rounded-padrao border border-borda bg-vidro shadow-flutuante backdrop-blur-xl ${
        recolhido ? "w-auto" : "w-[288px]"
      }`}
    >
      <motion.button
        layout="position"
        transition={transicao}
        type="button"
        onClick={() => setRecolhido((r) => !r)}
        aria-expanded={!recolhido}
        aria-label={recolhido ? `Mostrar requisitos (${contagem(requisitos.length)})` : "Recolher requisitos"}
        className={`flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-inset ${
          recolhido ? "rounded-full px-3.5 py-2" : "px-4 pt-3.5 pb-2"
        }`}
      >
        {recolhido ? (
          <>
            <Selo />
            <span className="text-xs font-medium whitespace-nowrap text-texto tabular-nums">
              <Numero valor={requisitos.length} reduzir={reduzir} /> {requisitos.length === 1 ? "requisito" : "requisitos"}
            </span>
          </>
        ) : (
          <span className="flex-1 text-xs font-medium tracking-tight text-texto-suave">Requisitos combinados</span>
        )}
        <motion.svg
          viewBox="0 0 16 16"
          width={14}
          height={14}
          aria-hidden
          animate={{ rotate: recolhido ? 0 : 180 }}
          transition={transicao}
          className="shrink-0 fill-none stroke-texto-suave"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </motion.svg>
      </motion.button>

      {/* popLayout: o conteúdo sai do fluxo na hora, e o painel encolhe enquanto ele esmaece. */}
      <AnimatePresence initial={false} mode="popLayout">
        {!recolhido && (
          <motion.div
            key="conteudo"
            layout="position"
            transition={transicao}
            className="w-[288px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: reduzir ? { duration: 0 } : { duration: 0.28, delay: 0.08 } }}
            exit={{ opacity: 0, transition: { duration: reduzir ? 0 : 0.12 } }}
          >
            <Fases fase={fase} reduzir={reduzir} />

            {requisitos.length === 0 ? (
              <p className="px-4 pt-1 pb-4 text-[13px] leading-relaxed text-texto-suave">
                Pergunte ao entrevistador sobre escala, prazos…
              </p>
            ) : (
              <ul className="px-2 pb-2" aria-live="polite">
                <AnimatePresence initial={false}>
                  {requisitos.map((r) => (
                    <Item
                      key={r.id}
                      requisito={r}
                      animar={!reduzir && !prontos.has(r.id)}
                      reduzir={reduzir}
                      aoTerminar={() => marcarPronto(r.id)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** Indicador das fases: quatro traços, o atual em destaque, e o nome da fase ao lado. */
function Fases({ fase, reduzir }: { fase: Fase; reduzir: boolean }) {
  const atual = indiceDaFase(fase);
  const nome = nomeDaFase(fase);
  return (
    <div className="flex items-center gap-2.5 px-4 pb-3" aria-label={`Fase atual: ${nome}`} role="group">
      <ol className="flex gap-1" aria-hidden>
        {PASSOS.map((p, i) => (
          <li key={p.fase} className="relative h-1 w-5 overflow-hidden rounded-full bg-superficie-2">
            {i < atual && <span className="absolute inset-0 bg-marca/30" />}
            {i === atual && (
              <motion.span
                layoutId="fase-atual"
                transition={reduzir ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-full bg-marca"
              />
            )}
          </li>
        ))}
      </ol>
      <span className="relative h-4 flex-1 overflow-hidden text-[11px] font-medium text-texto-suave">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={nome}
            initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={reduzir ? { duration: 0 } : { duration: 0.28, ease: CURVA }}
            className="absolute inset-0 leading-4"
          >
            {nome}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

function Item({
  requisito,
  animar,
  reduzir,
  aoTerminar,
}: {
  requisito: Requisito;
  animar: boolean;
  reduzir: boolean;
  aoTerminar: () => void;
}) {
  const total = requisito.texto.length;
  const [letras, setLetras] = useState(animar ? 0 : total);
  const terminou = letras >= total;

  useEffect(() => {
    if (!animar) return;
    // Espera a linha abrir antes de começar a digitar.
    let i = 0;
    let intervalo: ReturnType<typeof setInterval> | undefined;
    const inicio = setTimeout(() => {
      intervalo = setInterval(() => {
        i += 1;
        setLetras(i);
        if (i >= total) clearInterval(intervalo);
      }, MS_POR_LETRA);
    }, 220);
    return () => {
      clearTimeout(inicio);
      if (intervalo) clearInterval(intervalo);
    };
  }, [animar, total]);

  useEffect(() => {
    if (terminou) aoTerminar();
    // aoTerminar muda a cada render do pai; só interessa o momento em que termina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminou]);

  return (
    <motion.li
      initial={animar ? { height: 0, opacity: 0 } : false}
      animate={{ height: "auto", opacity: 1 }}
      exit={reduzir ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={reduzir ? { duration: 0 } : { duration: 0.42, ease: CURVA }}
      className="overflow-hidden"
    >
      <div className="flex items-start gap-2.5 rounded-pequeno px-2 py-1.5">
        <Check feito={terminou} animar={animar} />
        <p className="flex-1 text-[13px] leading-snug text-texto">
          {/* Leitor de tela recebe o texto inteiro de uma vez; a digitação é só visual. */}
          <span className="sr-only">{requisito.texto}</span>
          <span aria-hidden>
            {requisito.texto.slice(0, letras)}
            {!terminou && <span className="text-texto-suave/40">{requisito.texto.slice(letras)}</span>}
          </span>
        </p>
      </div>
    </motion.li>
  );
}

/** Anel vazio enquanto digita; ao terminar, o círculo enche e o check é desenhado. */
function Check({ feito, animar }: { feito: boolean; animar: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden className="mt-px shrink-0">
      <circle cx="8" cy="8" r="7" className="fill-none stroke-borda" strokeWidth={1.5} />
      {feito && (
        <>
          <motion.circle
            cx="8"
            cy="8"
            r="7"
            className="fill-sucesso"
            initial={animar ? { scale: 0.4, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            style={{ transformOrigin: "8px 8px" }}
          />
          <motion.path
            d="M4.9 8.3 7 10.3l4.1-4.5"
            className="fill-none stroke-superficie"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={animar ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.32, delay: animar ? 0.12 : 0, ease: CURVA }}
          />
        </>
      )}
    </svg>
  );
}

/** Ícone da pílula recolhida: uma lista com check. */
function Selo() {
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0">
      <circle cx="8" cy="8" r="7" className="fill-sucesso" />
      <path
        d="M4.9 8.3 7 10.3l4.1-4.5"
        className="fill-none stroke-superficie"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Número que sobe quando muda (contagem da pílula). */
function Numero({ valor, reduzir }: { valor: number; reduzir: boolean }) {
  return (
    <span className="relative inline-flex overflow-hidden align-bottom">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={valor}
          initial={reduzir ? false : { y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduzir ? { opacity: 0 } : { y: "-100%", opacity: 0 }}
          transition={reduzir ? { duration: 0 } : { duration: 0.28, ease: CURVA }}
        >
          {valor}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
