"use client";

// Revisão antes de confirmar: uma folha lateral com campos de verdade (sem JSON), em seções numeradas.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Minus, Plus, X } from "lucide-react";
import { FocusArea, type Criterion, type InterviewMode } from "@/lib/contracts";
import type { Rascunho } from "@/lib/pre-entrevista/rascunho";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";

type Props = {
  rascunho: Rascunho;
  enviando: boolean;
  erros: string[];
  onConfirmar: (rascunho: Rascunho) => void;
  onFechar: () => void;
};

const campo =
  "w-full rounded-controle border border-borda bg-superficie-2 px-3 py-2 text-[15px] text-texto outline-none transition-colors duration-150 focus:border-texto/40 focus:bg-superficie";

function Segmentado<T extends string>({
  id,
  opcoes,
  valor,
  onMudar,
}: {
  id: string;
  opcoes: { valor: T; nome: string }[];
  valor: T;
  onMudar: (v: T) => void;
}) {
  return (
    <div className="flex rounded-controle border border-borda p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          className="relative flex-1 rounded-[3px] px-3 py-1.5 text-[14px] transition-colors duration-150"
          style={{ color: valor === o.valor ? "var(--superficie)" : "var(--texto-suave)" }}
        >
          {valor === o.valor && (
            <motion.span
              layoutId={`seg-${id}`}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="absolute inset-0 rounded-[3px] bg-texto"
            />
          )}
          <span className="relative">{o.nome}</span>
        </button>
      ))}
    </div>
  );
}

function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-borda px-6 py-5">
      <span className="rotulo text-texto-suave">
        {String(numero).padStart(2, "0")} · {titulo}
      </span>
      {children}
    </section>
  );
}

export default function RevisaoPlano({ rascunho, enviando, erros, onConfirmar, onFechar }: Props) {
  const [r, setR] = useState<Rascunho>(() => structuredClone(rascunho));
  const [pesos, setPesos] = useState<Record<FocusArea, number>>(() => {
    const base = Object.fromEntries(FocusArea.options.map((a) => [a, 0])) as Record<FocusArea, number>;
    for (const f of rascunho.focus) base[f.area] = Math.round(f.weight * 100);
    return base;
  });

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    addEventListener("keydown", aoTeclar);
    return () => removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  const soma = Object.values(pesos).reduce((a, b) => a + b, 0);
  const porcento = (a: FocusArea) => (soma > 0 ? Math.round((pesos[a] / soma) * 100) : 0);
  const duracao = r.durationMin ?? (r.mode === "system_design" ? 45 : 30);

  function mudarCriterio(i: number, mudanca: Partial<Criterion>) {
    setR((atual) => ({ ...atual, criteria: atual.criteria.map((c, j) => (j === i ? { ...c, ...mudanca } : c)) }));
  }

  function confirmar() {
    const focus = FocusArea.options
      .filter((a) => pesos[a] > 0)
      .map((area) => ({ area, weight: Math.round((pesos[area] / soma) * 100) / 100 }));
    onConfirmar({ ...r, focus, confirmado: { mode: true, seniority: true, focus: true } });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onFechar}
      className="fixed inset-0 z-40 flex justify-end bg-[rgb(17_17_17/0.28)]"
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Revisar o plano da entrevista"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 420, damping: 42 }}
        className="flex h-full w-full max-w-xl flex-col bg-superficie shadow-flutuante"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div className="flex flex-col gap-3">
            <span className="rotulo text-texto-suave">03 Plano · revisão final</span>
            <h2 className="titulo-display text-[30px] text-texto">Revise e confirme</h2>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="flex size-8 items-center justify-center rounded-controle text-texto-suave transition-colors hover:bg-fundo hover:text-texto"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-1 flex-col overflow-y-auto">
          <Secao numero={1} titulo="Vaga">
            <input value={r.roleTitle} onChange={(e) => setR({ ...r, roleTitle: e.target.value })} className={campo} aria-label="Cargo" />
            <Segmentado
              id="formato"
              valor={r.mode}
              onMudar={(mode: InterviewMode) => setR({ ...r, mode })}
              opcoes={(["system_design", "live_coding"] as InterviewMode[]).map((v) => ({ valor: v, nome: NOME_FORMATO[v] }))}
            />
            <Segmentado
              id="senioridade"
              valor={r.seniority}
              onMudar={(seniority) => setR({ ...r, seniority })}
              opcoes={(["junior", "pleno", "senior"] as const).map((v) => ({ valor: v, nome: NOME_SENIORIDADE[v] }))}
            />
          </Secao>

          <Secao numero={2} titulo="O que mais pesa">
            {FocusArea.options.map((a) => (
              <label key={a} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] text-texto">{NOME_AREA[a]}</span>
                  <span className="rotulo text-texto-suave">{porcento(a)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pesos[a]}
                  onChange={(e) => setPesos({ ...pesos, [a]: Number(e.target.value) })}
                  className="accent-[var(--texto)]"
                  aria-label={`Peso de ${NOME_AREA[a]}`}
                />
              </label>
            ))}
            <p className="text-[13px] text-texto-suave">Áreas em 0% ficam de fora. Os pesos somam 100%.</p>
          </Secao>

          <Secao numero={3} titulo={`Critérios · ${r.criteria.length}`}>
            <div className="-mx-6 flex flex-col">
              {r.criteria.map((c, i) => (
                <div key={c.id} className="flex flex-col gap-2 border-t border-borda px-6 py-3 first:border-t-0">
                  <div className="flex items-center gap-2">
                    <input
                      value={c.name}
                      onChange={(e) => mudarCriterio(i, { name: e.target.value })}
                      className={campo}
                      aria-label="Nome do critério"
                    />
                    <select
                      value={c.focus}
                      onChange={(e) => mudarCriterio(i, { focus: e.target.value as FocusArea })}
                      className="rounded-controle border border-borda bg-superficie-2 px-2 py-2 text-[14px] text-texto"
                      aria-label="Área do critério"
                    >
                      {FocusArea.options.map((a) => (
                        <option key={a} value={a}>
                          {NOME_AREA[a]}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setR({ ...r, criteria: r.criteria.filter((_, j) => j !== i) })}
                      aria-label={`Remover ${c.name}`}
                      className="rotulo shrink-0 rounded-controle px-2 py-2 text-texto-suave transition-colors hover:bg-fundo hover:text-perigo"
                    >
                      Remover
                    </button>
                  </div>
                  <textarea
                    value={c.description}
                    onChange={(e) => mudarCriterio(i, { description: e.target.value })}
                    rows={2}
                    className={`${campo} resize-y text-[14px] leading-relaxed`}
                    aria-label="O que conta como bom e ruim"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setR({
                  ...r,
                  criteria: [
                    ...r.criteria,
                    { id: `novo-${Date.now().toString(36)}`, name: "Novo critério", focus: "tecnico", weight: 1, description: "Bom: … Ruim: …" },
                  ],
                })
              }
              className="rotulo self-start rounded-controle border border-dashed border-texto/25 px-3 py-2 text-texto transition-colors hover:border-texto/60"
            >
              + Adicionar critério
            </button>
          </Secao>

          <Secao numero={4} titulo="Detalhes">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setR({ ...r, durationMin: Math.max(15, duracao - 5) })}
                aria-label="Diminuir 5 minutos"
                className="flex size-9 items-center justify-center rounded-controle border border-borda text-texto transition-colors hover:bg-fundo"
              >
                <Minus size={15} />
              </button>
              <span className="w-28 text-center text-[17px] text-texto">{duracao} minutos</span>
              <button
                onClick={() => setR({ ...r, durationMin: Math.min(120, duracao + 5) })}
                aria-label="Aumentar 5 minutos"
                className="flex size-9 items-center justify-center rounded-controle border border-borda text-texto transition-colors hover:bg-fundo"
              >
                <Plus size={15} />
              </button>
            </div>
            <textarea
              value={r.recruiterNotes}
              onChange={(e) => setR({ ...r, recruiterNotes: e.target.value })}
              rows={3}
              placeholder="Observações para o entrevistador"
              className={`${campo} resize-y`}
              aria-label="Observações para o entrevistador"
            />
          </Secao>
        </div>

        <footer className="flex flex-col gap-3 border-t border-borda px-6 py-4">
          {erros.length > 0 && (
            <ul className="flex flex-col gap-1 text-[13.5px] text-perigo">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              onClick={onFechar}
              className="flex-1 rounded-controle bg-fundo px-4 py-3 text-[15px] text-texto transition-colors hover:bg-superficie-2"
            >
              Voltar à conversa
            </button>
            <button
              onClick={confirmar}
              disabled={enviando || r.criteria.length === 0 || soma === 0}
              className="flex-1 rounded-controle bg-marca px-4 py-3 text-[15px] font-medium text-texto-claro transition-[filter,transform] duration-150 hover:opacity-85 active:scale-[0.98] disabled:opacity-40"
            >
              {enviando ? "Publicando…" : "Confirmar e publicar a vaga"}
            </button>
          </div>
        </footer>
      </motion.aside>
    </motion.div>
  );
}
