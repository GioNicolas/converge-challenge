"use client";

// "Voltar" de qualquer relatório: volta para onde a pessoa estava; se abriu o link direto (sem histórico), vai para as vagas.
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function VoltarLink({ texto = "Voltar", className = "" }: { texto?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/vagas"))}
      className={`inline-flex w-fit items-center gap-1.5 text-[13px] text-texto-suave transition-colors hover:text-texto ${className}`}
    >
      <ArrowLeft size={14} /> {texto}
    </button>
  );
}
