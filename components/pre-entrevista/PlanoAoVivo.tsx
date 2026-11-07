"use client";

// O plano da entrevista se montando enquanto o recrutador conversa com a Totti.
// O que ela sugeriu aparece tracejado; o que o recrutador confirmou fica sólido, com check.
// Toda mudança brilha por um instante, para ficar claro o que a Totti entendeu.
import { AnimatePresence, motion } from "motion/react";
import { Clock, Code2, PenTool } from "lucide-react";
import type { EstadoSessao } from "@/lib/pre-entrevista/sessoes";
import { curvaSuave, mola } from "@/lib/design/motion";
import { DESCRICAO_FORMATO, NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";
import Check from "./Check";

/** Brilha (fundo azul que esmaece) sempre que `chave` muda. */
function Brilho({ chave, children, className }: { chave: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      key={chave}
      initial={{ backgroundColor: "rgba(10,132,255,0.16)" }}
      animate={{ backgroundColor: "rgba(10,132,255,0)" }}
      transition={{ duration: 1.6, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Selo({ texto, confirmado }: { texto: string; confirmado: boolean }) {
  return (
    <motion.span
      layout
      transition={mola}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-corpo font-medium ${
        confirmado ? "bg-marca-suave text-texto" : "border border-dashed border-texto-suave/50 text-texto-suave"
      }`}
    >
      {confirmado && <Check tamanho={14} />}
      {texto}
      {!confirmado && <span className="text-mini font-normal">sugerido</span>}
    </motion.span>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="label-pequena text-texto-suave">{titulo}</h3>
      {children}
    </section>
  );
}

export default function PlanoAoVivo({ estado }: { estado: EstadoSessao }) {
  const r = estado.rascunho;
  const IconeFormato = r.mode === "system_design" ? PenTool : Code2;
  const focoOrdenado = [...r.focus].sort((a, b) => b.weight - a.weight);
  const criterios = [...r.criteria].sort((a, b) => b.weight - a.weight);

  return (
    <section className="vidro flex min-h-0 flex-col overflow-hidden rounded-padrao shadow-cartao">
      <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3.5">
        <div className="flex flex-col">
          <span className="titulo text-subtitulo text-texto">Plano da entrevista</span>
          <span className="text-mini text-texto-suave">Se atualiza enquanto vocês conversam</span>
        </div>
        <AnimatePresence>
          {estado.status.extraindo && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-mini text-texto-suave"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-marca" />
              Atualizando
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-5 py-5">
        {/* Formato e senioridade */}
        <Secao titulo="Formato">
          <Brilho chave={`${r.mode}-${r.confirmado.mode}`} className="-m-2 flex items-start gap-3 rounded-controle p-2">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-controle bg-marca-suave text-marca">
              <IconeFormato size={20} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap gap-2">
                <Selo texto={NOME_FORMATO[r.mode]} confirmado={r.confirmado.mode} />
                <Selo texto={NOME_SENIORIDADE[r.seniority]} confirmado={r.confirmado.seniority} />
              </div>
              <p className="text-corpo text-texto-suave">{DESCRICAO_FORMATO[r.mode]}</p>
            </div>
          </Brilho>
        </Secao>

        {/* Foco */}
        <Secao titulo="O que mais pesa">
          <ul className="flex flex-col gap-3">
            {focoOrdenado.map((f) => (
              <motion.li key={f.area} layout transition={mola} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-corpo-grande text-texto">{NOME_AREA[f.area]}</span>
                  <span className="numero text-corpo text-texto-suave">{Math.round(f.weight * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
                  <motion.div
                    className="h-full rounded-full bg-marca"
                    initial={{ width: 0 }}
                    animate={{ width: `${f.weight * 100}%` }}
                    transition={{ duration: 0.6, ease: curvaSuave }}
                  />
                </div>
              </motion.li>
            ))}
          </ul>
          {!r.confirmado.focus && <p className="text-mini text-texto-suave">Sugestão da Totti, a confirmar na conversa.</p>}
        </Secao>

        {/* Critérios */}
        <Secao titulo={`Critérios de avaliação (${criterios.length})`}>
          <ul className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {criterios.map((c) => (
                <motion.li
                  key={c.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.36, ease: curvaSuave }}
                  className="overflow-hidden rounded-controle border border-borda"
                >
                  <Brilho chave={`${c.name}|${c.description}|${c.weight}`} className="flex flex-col gap-1 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-corpo-grande font-medium text-texto">{c.name}</span>
                      <span className="shrink-0 rounded-full bg-superficie-2 px-2 py-0.5 text-mini text-texto-suave">
                        {NOME_AREA[c.focus]}
                      </span>
                    </div>
                    <p className="text-corpo leading-relaxed text-texto-suave">{c.description}</p>
                  </Brilho>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Secao>

        {/* Duração e observações */}
        <Secao titulo="Detalhes">
          <Brilho chave={`${r.durationMin}|${r.recruiterNotes}`} className="-m-2 flex flex-col gap-3 rounded-controle p-2">
            <div className="flex items-center gap-2 text-corpo-grande text-texto">
              <Clock size={16} strokeWidth={1.75} className="text-texto-suave" />
              {r.durationMin ? `${r.durationMin} minutos` : r.mode === "system_design" ? "45 minutos (padrão)" : "30 minutos (padrão)"}
            </div>
            {r.recruiterNotes ? (
              <p className="text-corpo leading-relaxed whitespace-pre-wrap text-texto-suave">{r.recruiterNotes}</p>
            ) : (
              <p className="text-corpo text-texto-suave/60">As suas observações sobre o time e o tom aparecem aqui.</p>
            )}
          </Brilho>
        </Secao>

        {/* O que já foi combinado */}
        <Secao titulo="O que já combinamos">
          <ul className="flex flex-col gap-2">
            {estado.topicos.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5">
                <span className="flex size-[18px] items-center justify-center">
                  {t.coberto ? <Check /> : <span className="size-[14px] rounded-full border-[1.5px] border-texto-suave/40" />}
                </span>
                <span className={`text-corpo-grande ${t.coberto ? "text-texto" : "text-texto-suave"}`}>
                  {t.pergunta}
                  {t.opcional && !t.coberto && <span className="text-mini text-texto-suave/60"> · opcional</span>}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      </div>
    </section>
  );
}
