"use client";

import { LoaderCircle, Square, Volume2, VolumeX } from "lucide-react";
import type { VozAgente } from "@/lib/voz/useVozAgente";

export default function ControleVoz({ voz, texto, disabled = false }: { voz: VozAgente; texto?: string; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      <button
        type="button" onClick={voz.alternar}
        aria-label={voz.habilitada ? "Silenciar respostas por voz" : "Ativar respostas por voz"}
        title={voz.habilitada ? "Silenciar respostas por voz" : "Ativar respostas por voz"}
        aria-pressed={voz.habilitada}
        className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/5"
      >
        {voz.habilitada ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
      {voz.ativa ? (
        <button type="button" onClick={voz.parar} aria-label="Interromper resposta falada" className="flex items-center gap-1 rounded px-2 py-1 hover:bg-black/5">
          {voz.estado === "preparando" ? <LoaderCircle size={13} className="animate-spin" /> : <Square size={12} />}
          {voz.estado === "preparando" ? "Preparando voz…" : "Parar voz"}
        </button>
      ) : texto && (
        <button type="button" onClick={() => void voz.falar(texto)} disabled={disabled || !voz.habilitada} className="rounded px-2 py-1 hover:bg-black/5 disabled:opacity-40">
          Ouvir resposta
        </button>
      )}
      {voz.erro && <span role="alert" className="basis-full text-red-600">{voz.erro}</span>}
    </div>
  );
}
