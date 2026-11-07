"use client";

// O plano da entrevista se montando enquanto o recrutador conversa com o Totti.
// Seções numeradas. O que o Totti sugeriu leva o rótulo "Sugerido"; o que foi confirmado,
// "Confirmado" em azul. Toda mudança acende em azul, para ficar claro o que ele entendeu.
import { AnimatePresence, motion } from "motion/react";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import { curvaSuave } from "@/lib/design/motion";
import { DESCRICAO_FORMATO, NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";

/** Acende em azul sempre que `chave` muda. */
function Marcador({ chave, children, className }: { chave: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      key={chave}
      initial={{ backgroundColor: "rgba(17,17,17,0.07)" }}
      animate={{ backgroundColor: "rgba(17,17,17,0)" }}
      transition={{ duration: 1.8, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Estado({ confirmado }: { confirmado: boolean }) {
  return (
    <span className={`rotulo ${confirmado ? "rotulo-destaque" : "rotulo-neutro"}`}>
      {confirmado ? "Confirmado" : "Sugerido"}
    </span>
  );
}

function Secao({ numero, titulo, extra, children }: { numero: number; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-borda px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <span className="rotulo text-texto-suave">
          {String(numero).padStart(2, "0")} · {titulo}
        </span>
        {extra}
      </div>
      {children}
    </section>
  );
}

export default function PlanoAoVivo({ estado }: { estado: EstadoSessao }) {
  const r = estado.rascunho;
  const foco = [...r.focus].sort((a, b) => b.weight - a.weight);
  const criterios = [...r.criteria].sort((a, b) => b.weight - a.weight);
  const combinados = estado.topicos.filter((t) => t.coberto).length;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-padrao bg-superficie">
      <header className="flex items-baseline justify-between gap-3 px-5 py-3">
        <span className="text-[15px] text-texto">Plano da entrevista</span>
        <span className="rotulo text-texto-suave">
          {estado.status.extraindo ? (
            <>
              Atualizando <span className="inline-block animate-pulse">▍</span>
            </>
          ) : (
            `${combinados}/${estado.topicos.length} combinados`
          )}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <Secao numero={1} titulo="Formato" extra={<Estado confirmado={r.confirmado.mode && r.confirmado.seniority} />}>
          <Marcador chave={`${r.mode}${r.seniority}${r.confirmado.mode}${r.confirmado.seniority}`} className="-m-1.5 rounded-controle p-1.5">
            <p className="text-[22px] leading-tight font-normal tracking-[-0.015em] text-texto">
              {NOME_FORMATO[r.mode]} · {NOME_SENIORIDADE[r.seniority]}
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-texto-suave">{DESCRICAO_FORMATO[r.mode]}</p>
          </Marcador>
        </Secao>

        <Secao numero={2} titulo="O que mais pesa" extra={<Estado confirmado={r.confirmado.focus} />}>
          <ul className="flex flex-col gap-3">
            {foco.map((f) => (
              <motion.li key={f.area} layout transition={{ duration: 0.4, ease: curvaSuave }} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] text-texto">{NOME_AREA[f.area]}</span>
                  <span className="rotulo text-texto-suave">{Math.round(f.weight * 100)}%</span>
                </div>
                <div className="h-[3px] bg-fundo">
                  <motion.div
                    className="h-full bg-texto"
                    initial={{ width: 0 }}
                    animate={{ width: `${f.weight * 100}%` }}
                    transition={{ duration: 0.7, ease: curvaSuave }}
                  />
                </div>
              </motion.li>
            ))}
          </ul>
        </Secao>

        <Secao numero={3} titulo={`Critérios · ${criterios.length}`}>
          <ul className="-mx-5 flex flex-col">
            <AnimatePresence initial={false}>
              {criterios.map((c) => (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.32, ease: curvaSuave }}
                  className="border-t border-borda first:border-t-0"
                >
                  <Marcador chave={`${c.name}|${c.description}|${c.weight}`} className="flex flex-col gap-1 px-5 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[15px] text-texto">{c.name}</span>
                      <span className="rotulo shrink-0 text-texto-suave">{NOME_AREA[c.focus]}</span>
                    </div>
                    <p className="text-[14px] leading-relaxed text-texto-suave">{c.description}</p>
                  </Marcador>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Secao>

        <Secao numero={4} titulo="Detalhes">
          <Marcador chave={`${r.durationMin}|${r.recruiterNotes}`} className="-m-1.5 flex flex-col gap-2 rounded-controle p-1.5">
            <p className="text-[15px] text-texto">
              {r.durationMin ?? (r.mode === "system_design" ? 45 : 30)} minutos
              {!r.durationMin && <span className="text-texto-suave"> · padrão</span>}
            </p>
            {r.recruiterNotes ? (
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-texto-suave">{r.recruiterNotes}</p>
            ) : (
              <p className="text-[14px] text-texto-suave/60">As suas observações sobre o time e o tom aparecem aqui.</p>
            )}
          </Marcador>
        </Secao>
      </div>
    </section>
  );
}
