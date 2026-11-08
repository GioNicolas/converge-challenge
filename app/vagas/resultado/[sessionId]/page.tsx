"use client";

// O cartão de um candidato: nota total, resumo, critérios, pontos fortes e fracos e, no fim, Avançar / Não avançar.
// Chega pelo "Ver relatório" da lista de resultados da vaga.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BlocoDeDecisao, CartaoEnxuto } from "@/components/vagas/ResultadosDaVaga";
import type { EntrevistaReal } from "@/lib/vagas/entrevistas";

export default function PaginaDoResultado() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [item, setItem] = useState<EntrevistaReal | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    fetch("/api/report", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<EntrevistaReal[]>) : []))
      .catch(() => [] as EntrevistaReal[])
      .then((lista) => vivo && setItem(lista.find((e) => e.sessionId === sessionId) ?? null));
    return () => {
      vivo = false;
    };
  }, [sessionId]);

  const nome = item?.candidato ?? `Candidato ${String(sessionId).slice(0, 6)}`;

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 py-8 text-texto">
      <button type="button" onClick={() => router.back()} className="inline-flex w-fit items-center gap-1.5 text-[13px] text-texto-suave hover:text-texto">
        <ArrowLeft size={14} /> Voltar aos resultados
      </button>

      {item === undefined && <p className="text-[14px] text-texto-suave">Carregando…</p>}
      {item === null && <p className="text-[14px] text-texto-suave">Não encontrei esta entrevista.</p>}

      {item && (
        <article className="cartao flex flex-col gap-5 p-6">
          <header className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em]">{nome}</h1>
              <span className="text-[13px] text-texto-suave">{item.roleTitle}</span>
            </div>
            {item.overallScore !== undefined && (
              <div className="flex shrink-0 items-baseline gap-1">
                <span className="titulo-display text-[40px]">{item.overallScore.toFixed(1).replace(".", ",")}</span>
                <span className="numero text-[14px] text-texto-suave">/4</span>
              </div>
            )}
          </header>

          {item.cartao ? (
            <>
              <CartaoEnxuto e={item} cartao={item.cartao} />
              <BlocoDeDecisao e={item} />
            </>
          ) : (
            <>
              <p className="text-[14px] text-texto-suave">O relatório ainda está sendo gerado. Volte em instantes.</p>
              <Link href={item.href} className="text-[13px] underline underline-offset-4">
                Abrir o relatório
              </Link>
            </>
          )}
        </article>
      )}
    </main>
  );
}
