"use client";

// Revisão antes de confirmar: uma folha lateral com campos de verdade (sem JSON).
// Formato e senioridade em seletores, pesos do foco em controles deslizantes, critérios editáveis.
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { FocusArea, type Criterion, type InterviewMode } from "@/lib/contracts";
import type { Rascunho } from "@/lib/pre-entrevista/rascunho";
import { mola } from "@/lib/design/motion";
import { NOME_AREA, NOME_FORMATO, NOME_SENIORIDADE } from "./textos";

type Props = {
  rascunho: Rascunho;
  enviando: boolean;
  erros: string[];
  onConfirmar: (rascunho: Rascunho) => void;
  onFechar: () => void;
};

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
    <div className="flex rounded-full bg-superficie-2 p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          className="relative flex-1 rounded-full px-3 py-1.5 text-corpo font-medium transition-colors duration-rapida ease-suave"
          style={{ color: valor === o.valor ? "var(--texto-claro)" : "var(--texto-suave)" }}
        >
          {valor === o.valor && (
            <motion.span layoutId={`seg-${id}`} transition={mola} className="absolute inset-0 rounded-full bg-marca" />
          )}
          <span className="relative">{o.nome}</span>
        </button>
      ))}
    </div>
  );
}

const campo =
  "w-full rounded-controle border border-borda bg-superficie-2/60 px-3 py-2 text-corpo-grande text-texto outline-none transition-[border-color] duration-rapida ease-suave focus:border-marca";

export default function RevisaoPlano({ rascunho, enviando, erros, onConfirmar, onFechar }: Props) {
  const [r, setR] = useState<Rascunho>(() => structuredClone(rascunho));
  // Pesos do foco de 0 a 100 para as quatro áreas (as que ficarem em 0 saem do foco).
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
      className="fixed inset-0 z-40 flex justify-end bg-black/40 backdrop-blur-sm"
    >
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Revisar o plano da entrevista"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="flex h-full w-full max-w-xl flex-col border-l border-borda bg-superficie shadow-flutuante"
      >
        <header className="flex items-center justify-between border-b border-borda px-6 py-4">
          <div>
            <h2 className="titulo text-xl text-texto">Revisar e confirmar</h2>
            <p className="text-corpo text-texto-suave">Ajuste o que quiser antes de gerar o link.</p>
          </div>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="flex size-8 items-center justify-center rounded-full text-texto-suave transition-colors duration-rapida hover:bg-superficie-2 hover:text-texto"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-6 py-6">
          <label className="flex flex-col gap-1.5">
            <span className="label-pequena text-texto-suave">Cargo</span>
            <input value={r.roleTitle} onChange={(e) => setR({ ...r, roleTitle: e.target.value })} className={campo} />
          </label>

          <div className="flex flex-col gap-2">
            <span className="label-pequena text-texto-suave">Formato</span>
            <Segmentado
              id="formato"
              valor={r.mode}
              onMudar={(mode: InterviewMode) => setR({ ...r, mode })}
              opcoes={(["system_design", "live_coding"] as InterviewMode[]).map((v) => ({ valor: v, nome: NOME_FORMATO[v] }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="label-pequena text-texto-suave">Senioridade</span>
            <Segmentado
              id="senioridade"
              valor={r.seniority}
              onMudar={(seniority) => setR({ ...r, seniority })}
              opcoes={(["junior", "pleno", "senior"] as const).map((v) => ({ valor: v, nome: NOME_SENIORIDADE[v] }))}
            />
          </div>

          <div className="flex flex-col gap-3">
            <span className="label-pequena text-texto-suave">O que mais pesa</span>
            {FocusArea.options.map((a) => (
              <label key={a} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-corpo-grande text-texto">{NOME_AREA[a]}</span>
                  <span className="numero text-corpo text-texto-suave">{porcento(a)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={pesos[a]}
                  onChange={(e) => setPesos({ ...pesos, [a]: Number(e.target.value) })}
                  className="accent-[var(--marca)]"
                  aria-label={`Peso de ${NOME_AREA[a]}`}
                />
              </label>
            ))}
            <p className="text-mini text-texto-suave">Áreas em 0% ficam de fora. Os pesos são normalizados para somar 100%.</p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="label-pequena text-texto-suave">Critérios de avaliação</span>
            {r.criteria.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                transition={mola}
                className="flex flex-col gap-2 rounded-controle border border-borda p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={c.name}
                    onChange={(e) => mudarCriterio(i, { name: e.target.value })}
                    className={`${campo} font-medium`}
                    aria-label="Nome do critério"
                  />
                  <select
                    value={c.focus}
                    onChange={(e) => mudarCriterio(i, { focus: e.target.value as FocusArea })}
                    className="rounded-controle border border-borda bg-superficie-2 px-2 py-2 text-corpo text-texto"
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
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-texto-suave transition-colors duration-rapida hover:bg-perigo/15 hover:text-perigo"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <textarea
                  value={c.description}
                  onChange={(e) => mudarCriterio(i, { description: e.target.value })}
                  rows={2}
                  className={`${campo} resize-y text-corpo leading-relaxed`}
                  aria-label="O que conta como bom e ruim"
                />
              </motion.div>
            ))}
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
              className="flex items-center justify-center gap-1.5 rounded-controle border border-dashed border-borda py-2.5 text-corpo font-medium text-texto-suave transition-colors duration-rapida hover:border-marca hover:text-texto"
            >
              <Plus size={16} /> Adicionar critério
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label-pequena text-texto-suave">Duração</span>
            <div className="flex items-center gap-3">
              {[
                { icone: Minus, passo: -5, rotulo: "Diminuir" },
                { icone: Plus, passo: 5, rotulo: "Aumentar" },
              ].map(({ icone: Icone, passo, rotulo }, i) => (
                <button
                  key={rotulo}
                  onClick={() =>
                    setR({ ...r, durationMin: Math.min(120, Math.max(15, (r.durationMin ?? (r.mode === "system_design" ? 45 : 30)) + passo)) })
                  }
                  aria-label={`${rotulo} 5 minutos`}
                  className={`flex size-9 items-center justify-center rounded-full bg-superficie-2 text-texto transition-transform duration-rapida active:scale-90 ${i === 1 ? "order-3" : ""}`}
                >
                  <Icone size={16} />
                </button>
              ))}
              <span className="numero order-2 w-24 text-center text-subtitulo text-texto">
                {r.durationMin ?? (r.mode === "system_design" ? 45 : 30)} min
              </span>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="label-pequena text-texto-suave">Observações para o entrevistador</span>
            <textarea
              value={r.recruiterNotes}
              onChange={(e) => setR({ ...r, recruiterNotes: e.target.value })}
              rows={3}
              className={`${campo} resize-y`}
            />
          </label>
        </div>

        <footer className="flex flex-col gap-3 border-t border-borda px-6 py-4">
          {erros.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-controle bg-perigo/15 px-3 py-2 text-corpo text-perigo">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              onClick={onFechar}
              className="flex-1 rounded-full bg-superficie-2 px-4 py-2.5 text-corpo-grande font-medium text-texto transition-colors duration-rapida hover:bg-borda"
            >
              Voltar à conversa
            </button>
            <button
              onClick={confirmar}
              disabled={enviando || r.criteria.length === 0 || soma === 0}
              className="flex-1 rounded-full bg-marca px-4 py-2.5 text-corpo-grande font-medium text-texto-claro transition-[opacity,transform] duration-rapida ease-suave hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
            >
              {enviando ? "Gerando…" : "Confirmar e gerar link"}
            </button>
          </div>
        </footer>
      </motion.aside>
    </motion.div>
  );
}
