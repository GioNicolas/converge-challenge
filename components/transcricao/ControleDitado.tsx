"use client";

import { LoaderCircle, Mic, Square } from "lucide-react";
import type { Transcricao } from "@/lib/transcricao/useTranscricao";

export function BotaoDitado({ transcricao: t, disabled = false }: { transcricao: Transcricao; disabled?: boolean }) {
  const ocupado = t.estado === "conectando" || t.estado === "finalizando";
  const rotulo = t.estado === "conectando" ? "Cancelar conexão do microfone"
    : t.estado === "finalizando" ? "Finalizando transcrição"
    : t.ativa ? "Parar ditado" : "Ditar por voz";
  return (
    <button
      type="button"
      onClick={() => t.ativa ? void t.parar() : void t.iniciar()}
      disabled={disabled || t.estado === "finalizando"}
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={t.ativa}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${t.ativa ? "bg-red-100 text-red-700" : "text-inherit hover:bg-black/5"}`}
    >
      {ocupado ? <LoaderCircle size={16} className="animate-spin" /> : t.ativa ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
    </button>
  );
}

export function EstadoDitado({ transcricao: t }: { transcricao: Transcricao }) {
  return (
    <>
      {t.ativa && (
        <div role="status" className="text-[12px] text-inherit opacity-75">
          {t.estado === "conectando" ? "Conectando o microfone…" : t.estado === "finalizando" ? "Finalizando transcrição…"
            : t.parcial || "Ouvindo… Pare o ditado para revisar e enviar."}
        </div>
      )}
      {t.erro && <p role="alert" className="text-[12px] text-red-600">{t.erro}</p>}
    </>
  );
}
