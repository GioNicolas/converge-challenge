"use client";

// A página de uma vaga (/vagas/vaga?id=...&etapa=...). O id vai na query para não depender de rota dinâmica.
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PaginaVaga from "@/components/vagas/PaginaVaga";
import { ETAPAS_VAGA, type EtapaVaga } from "@/lib/vagas/workspace";

function Conteudo() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const pedida = params.get("etapa");
  const etapa: EtapaVaga = ETAPAS_VAGA.includes(pedida as EtapaVaga) ? (pedida as EtapaVaga) : "entrevistas";
  return <PaginaVaga id={id} etapa={etapa} />;
}

export default function Page() {
  return (
    <Suspense>
      <Conteudo />
    </Suspense>
  );
}
