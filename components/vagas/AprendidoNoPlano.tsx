"use client";

// No Plano combinado de uma vaga aberta: o que o Totti já aprendeu com o time e vai usar nesta entrevista
// (as regras ligadas da memória da squad que pesam em critérios deste formato). As que vieram dos 90 dias dizem o
// que o Totti passa a fazer na entrevista; as outras, o pedido do time. O que veio de uma contratação
// aos 90 dias aparece marcado: é o ciclo fechando.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Brain } from "lucide-react";
import type { InterviewMode } from "@/lib/contracts";
import { CATALOGO } from "@/lib/pre-entrevista/catalogo";
import { MUDANCA, mudancaDaRegra } from "@/lib/noventa-dias/mudanca";
import type { RegraSquad } from "@/lib/squad-memory/tipos";
import type { VisaoMemoria } from "@/lib/squad-memory/visao";

/** "Penaliza caso de borda só citado, sem teste: Bianca…" → "caso de borda só citado, sem teste". */
const pedido = (texto: string) =>
  texto
    .split(":")[0]
    .replace(/^(valoriza|penaliza)\s+/i, "")
    .trim();

/** Dos 90 dias: o que o Totti passa a fazer na entrevista. Das outras origens: o pedido do time. */
function oQueMuda(r: RegraSquad): string {
  const frase = r.origem.tipo === "resultado_90_dias" && MUDANCA[r.criterio] ? mudancaDaRegra(r).naEntrevista : pedido(r.texto);
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

export default function AprendidoNoPlano({ formato, verTudo = "/vagas/aprendizado" }: { formato: InterviewMode; verTudo?: string }) {
  const [memoria, setMemoria] = useState<VisaoMemoria | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/squad-memory", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => vivo && setMemoria(m as VisaoMemoria | null))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  if (!memoria) return null;
  const ids = new Set(CATALOGO[formato].map((c) => c.id));
  const regras = memoria.regras.filter((r) => r.ativa && ids.has(r.criterio));
  if (regras.length === 0) return null;
  const nome = (id: string) => memoria.criterios.find((c) => c.id === id)?.nome ?? id;
  // As dos 90 dias primeiro: são as mais recentes do ciclo e as que mais mudam a nota.
  const ordenadas = [...regras].sort(
    (a, b) => Number(b.origem.tipo === "resultado_90_dias") - Number(a.origem.tipo === "resultado_90_dias"),
  );

  return (
    <section className="cartao flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-texto">
          <Brain size={15} />
          Aprendido com o time
          <span className="numero text-[13px] font-normal text-texto-suave">{regras.length}</span>
        </h2>
        <Link href={verTudo} className="inline-flex items-center gap-1 text-[13px] text-texto-suave hover:text-texto">
          Ver tudo
          <ArrowRight size={13} />
        </Link>
      </div>
      <ul className="flex flex-col">
        {ordenadas.map((r) => (
          <Linha key={r.id} regra={r} criterio={nome(r.criterio)} />
        ))}
      </ul>
    </section>
  );
}

function Linha({ regra: r, criterio }: { regra: RegraSquad; criterio: string }) {
  const dos90 = r.origem.tipo === "resultado_90_dias" ? r.origem : null;
  return (
    <li className="grid gap-x-4 gap-y-1 border-t border-borda py-3 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[250px_minmax(0,1fr)_auto] sm:items-baseline">
      <span className="text-[14px] font-medium text-texto">
        {criterio}{" "}
        <span className="font-normal text-texto-suave">· {r.efeito === "penaliza" ? "mais rigor" : "mais crédito"}</span>
      </span>
      <span className="text-[14px] text-texto-suave">{oQueMuda(r)}</span>
      {dos90 && (
        <span className="rotulo-neutro self-start justify-self-start !text-texto">
          {dos90.candidato.split(" ")[0]} aos 90 dias
        </span>
      )}
    </li>
  );
}
