"use client";

// O plano da entrevista ao lado da conversa, quando o Totti a encerra. É o único lugar da tela que diz o que
// está acontecendo: enquanto a extração em segundo plano junta o que foi combinado, o status diz "montando" e
// o que ainda não foi confirmado aparece como esqueleto; quando termina, o mesmo cartão traz "Revisar o plano"
// (o botão do cabeçalho voa até aqui, mesmo `layoutId`). Sem porcentagem: o Totti pode encerrar sem cobrir
// todo tópico, e um "50%" parado parecia travado. A ordem das seções é a da revisão (RevisaoPlano).
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { FocusArea } from "@/lib/contracts";
import { duracaoDoRascunho, type Rascunho } from "@/lib/pre-entrevista/rascunho";
import { curvaSuave } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";

type Props = {
  rascunho: Rascunho;
  /** A extração terminou e o cartão já pode mandar para a revisão. */
  pronto: boolean;
  onRevisar: () => void;
  onContinuar: () => void;
};

/** Mesmos tons da barra de pesos da revisão: sem cor de destaque, só opacidade. */
const TOM: Record<FocusArea, string> = {
  tecnico: "bg-texto",
  escala_produto: "bg-texto/65",
  pressao: "bg-texto/40",
  uso_ia: "bg-texto/20",
};

export default function PlanoSeMontando({ rascunho, pronto, onRevisar, onContinuar }: Props) {
  const foco = [...rascunho.focus].filter((f) => f.weight > 0).sort((a, b) => b.weight - a.weight);
  const somaFoco = foco.reduce((s, f) => s + f.weight, 0) || 1;
  const criterios = [...rascunho.criteria].sort((a, b) => b.weight - a.weight);
  const somaCriterios = criterios.reduce((s, c) => s + c.weight, 0) || 1;
  const fatos = [
    { rotulo: "Formato", valor: NOME_FORMATO[rascunho.mode], ok: rascunho.confirmado.mode },
    { rotulo: "Nível", valor: NOME_SENIORIDADE[rascunho.seniority], ok: rascunho.confirmado.seniority },
    { rotulo: "Duração", valor: `${duracaoDoRascunho(rascunho)} min`, ok: true },
  ];

  return (
    <aside
      aria-label="Plano da entrevista"
      aria-busy={!pronto}
      className="flex min-h-0 flex-col overflow-hidden rounded-[28px] bg-superficie shadow-[0_1px_2px_rgb(28_24_18/0.06),0_24px_50px_-30px_rgb(28_24_18/0.35)]"
    >
      <header className="flex flex-col gap-2 px-6 pt-6 pb-5">
        <Status pronto={pronto} />
        <h2 className="titulo-display text-[28px] leading-tight">Plano da entrevista</h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
        <Secao titulo="Como vai ser">
          <div className="grid grid-cols-3 divide-x divide-texto/8 rounded-2xl bg-fundo">
            {fatos.map((f) => (
              <div key={f.rotulo} className="flex min-w-0 flex-col gap-1 px-4 py-3">
                <span className="text-[12.5px] text-texto-suave">{f.rotulo}</span>
                {f.ok ? (
                  <span className="anim-surgir truncate text-[15px] font-semibold">{f.valor}</span>
                ) : (
                  <Esqueleto className="my-1 h-3.5 w-16 rounded-full" />
                )}
              </div>
            ))}
          </div>
        </Secao>

        <Secao titulo="O que mais pesa">
          {foco.length === 0 ? (
            <Esqueleto className="h-2 w-full rounded-full" />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                {foco.map((f) => (
                  <div
                    key={f.area}
                    className={`${TOM[f.area]} h-full transition-[flex-grow] duration-[900ms] ease-saida`}
                    style={{ flexGrow: f.weight / somaFoco }}
                  />
                ))}
              </div>
              <ul className="flex flex-col gap-1.5">
                {foco.map((f) => (
                  <li key={f.area} className="flex items-center gap-2.5 text-[14px]">
                    <span className={`${TOM[f.area]} size-2 shrink-0 rounded-full`} aria-hidden />
                    <span className="flex-1">{NOME_AREA[f.area]}</span>
                    <span className="numero font-mono text-[13px] text-texto-suave">{Math.round((f.weight / somaFoco) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Secao>

        <Secao titulo="Critérios" contagem={criterios.length || undefined}>
          {criterios.length === 0 ? (
            <div className="flex flex-col gap-2">
              <Esqueleto className="h-10 w-full rounded-2xl" />
              <Esqueleto className="h-10 w-full rounded-2xl" />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-texto/8 rounded-2xl bg-fundo">
              {criterios.map((c) => {
                const doTime = rascunho.origens[c.id] && rascunho.origens[c.id] !== "catalogo";
                return (
                  <li key={c.id} className="anim-subir flex items-center gap-3 px-4 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {doTime && (
                      <span className="shrink-0 rounded-full bg-superficie px-2 py-px text-[11.5px] font-semibold">dito por você</span>
                    )}
                    <span className="numero shrink-0 font-mono text-[13px] text-texto-suave">
                      {Math.round((c.weight / somaCriterios) * 100)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Secao>

        {rascunho.eliminatorios.length > 0 && (
          <Secao titulo="Reprova direto">
            <ul className="flex flex-col gap-2">
              {rascunho.eliminatorios.map((e) => (
                <li
                  key={e}
                  className="anim-subir rounded-2xl px-4 py-3 text-[14px] leading-relaxed shadow-[inset_0_0_0_1.5px_rgb(28_24_18/0.3)]"
                >
                  {e}
                </li>
              ))}
            </ul>
          </Secao>
        )}
      </div>

      <footer className="flex flex-col items-center gap-3 border-t border-texto/8 px-6 py-4">
        <AnimatePresence mode="wait" initial={false}>
          {pronto ? (
            <motion.button
              key="revisar"
              layoutId="cta-plano"
              onClick={onRevisar}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="group flex w-full items-center justify-center gap-2 rounded-full bg-texto px-5 py-3 text-[15px] font-medium text-texto-claro hover:opacity-90"
            >
              <motion.span layout="position" className="flex items-center gap-2">
                Revisar e publicar <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </motion.span>
            </motion.button>
          ) : (
            <motion.p
              key="montando"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: curvaSuave }}
              className="w-full rounded-full bg-fundo px-5 py-3 text-center text-[14px] text-texto-suave"
            >
              O Totti está juntando formato, foco e critérios…
            </motion.p>
          )}
        </AnimatePresence>
        <button onClick={onContinuar} className="text-[13px] text-texto-suave underline-offset-4 hover:text-texto hover:underline">
          Quero falar mais alguma coisa
        </button>
      </footer>
    </aside>
  );
}

/** Uma linha só: um ponto pulsando enquanto monta, um check quando fica pronto. */
function Status({ pronto }: { pronto: boolean }) {
  return (
    <span className="flex items-center gap-2 text-[13px] text-texto-suave" aria-live="polite">
      {pronto ? (
        <span className="flex size-4 items-center justify-center rounded-full bg-texto text-texto-claro" aria-hidden>
          <svg width="10" height="10" viewBox="0 0 16 16">
            <path d="M3.5 8.4 L6.6 11.3 L12.5 4.9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <span className="relative flex size-4 items-center justify-center" aria-hidden>
          <span className="anim-pulso absolute size-4 rounded-full bg-texto/25" />
          <span className="size-2 rounded-full bg-texto" />
        </span>
      )}
      {pronto ? "Pronto para revisar" : "Montando o plano"}
    </span>
  );
}

function Secao({ titulo, contagem, children }: { titulo: string; contagem?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-baseline gap-2 text-[13px] font-semibold text-texto-suave">
        {titulo}
        {contagem !== undefined && <span className="numero font-mono font-normal">{contagem}</span>}
      </h3>
      {children}
    </section>
  );
}

function Esqueleto({ className = "" }: { className?: string }) {
  return <span className={`anim-brilho block ${className}`} aria-hidden />;
}
