"use client";

// O plano da entrevista se montando, ao vivo, ao lado da conversa. Só leitura: cada fato aparece quando o
// Totti o confirma com a recrutadora (movimento = evento), com o valor subindo 10px e as barras de peso
// crescendo em 900ms. Dados do próprio rascunho; o que ainda não foi combinado fica como "—".
import { useContar } from "@/components/totti/useContar";
import { NOME_FORMATO_VAGA, NOME_SENIORIDADE_VAGA } from "@/lib/vagas/workspace";
import { duracaoDoRascunho, type Rascunho } from "@/lib/pre-entrevista/rascunho";

type Props = { rascunho: Rascunho; combinados: number; total: number };

export default function PlanoSeMontando({ rascunho, combinados, total }: Props) {
  const pct = Math.round(useContar(total > 0 ? (combinados / total) * 100 : 0));
  const somaPesos = rascunho.criteria.reduce((a, c) => a + c.weight, 0) || 1;
  const fatos = [
    { rotulo: "Formato", valor: NOME_FORMATO_VAGA[rascunho.mode], ok: rascunho.confirmado.mode },
    { rotulo: "Nível", valor: NOME_SENIORIDADE_VAGA[rascunho.seniority], ok: rascunho.confirmado.seniority },
    { rotulo: "Duração", valor: `${duracaoDoRascunho(rascunho)} min`, ok: rascunho.confirmado.focus },
  ];
  const reprova = rascunho.eliminatorios[0];

  return (
    <aside
      aria-label="Plano da entrevista, ao vivo"
      className="flex min-h-0 flex-col gap-5 overflow-y-auto rounded-[28px] bg-superficie p-6 shadow-[0_1px_2px_rgb(28_24_18/0.06),0_24px_50px_-30px_rgb(28_24_18/0.35)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[12.5px] text-texto-suave">plano se montando</span>
          <h2 className="titulo-display text-[28px]">Plano da entrevista</h2>
        </div>
        <span className="titulo-display text-[28px] text-texto-suave">{pct}%</span>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {fatos.map((f) => (
          <div
            key={f.rotulo}
            className="flex min-h-[58px] flex-col gap-0.5 rounded-2xl px-3.5 py-3 transition-[background-color,box-shadow] duration-[480ms]"
            style={{ background: f.ok ? "var(--fundo)" : "var(--superficie)", boxShadow: f.ok ? "none" : "inset 0 0 0 1.5px rgb(28 24 18 / 0.12)" }}
          >
            <span className="text-[12.5px] text-texto-suave">{f.rotulo}</span>
            <span
              className="font-semibold transition-[opacity,transform] duration-[480ms] ease-saida"
              style={{ opacity: f.ok ? 1 : 0.35, transform: `translateY(${f.ok ? 0 : 6}px)` }}
            >
              {f.ok ? f.valor : "—"}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-[13px] font-semibold text-texto-suave">O que pesa na avaliação</span>
        {rascunho.criteria.length === 0 ? (
          <p className="rounded-pequeno bg-fundo px-3.5 py-3 text-[14px] text-texto-suave">Os critérios aparecem aqui conforme vocês combinam.</p>
        ) : (
          rascunho.criteria.map((c) => {
            const peso = Math.round((c.weight / somaPesos) * 100);
            const doTime = rascunho.origens[c.id] && rascunho.origens[c.id] !== "catalogo";
            return (
              <div key={c.id} className="anim-subir flex flex-col gap-1.5 rounded-pequeno bg-fundo px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{c.name}</span>
                  <span className="flex items-center gap-2">
                    {doTime && (
                      <span className="rounded-full bg-superficie-2 px-2 py-px text-[11.5px] font-semibold">dito por você</span>
                    )}
                    <span className="font-mono text-[13px]">{peso}%</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-superficie-2">
                  <div
                    className="h-full rounded-full bg-texto transition-[width] duration-[900ms] ease-saida"
                    style={{ width: `${Math.min(100, peso * 3)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {reprova && (
        <div className="anim-subir flex flex-col gap-1 rounded-2xl bg-superficie px-4 py-3.5 shadow-[inset_0_0_0_1.5px_rgb(28_24_18/0.35)]">
          <span className="text-[13px] font-semibold">Reprova direto</span>
          <span>{reprova}</span>
        </div>
      )}
    </aside>
  );
}
