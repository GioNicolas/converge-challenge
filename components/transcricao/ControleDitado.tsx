"use client";

import type { RefObject } from "react";
import { LoaderCircle, Mic, Square } from "lucide-react";
import type { Transcricao } from "@/lib/transcricao/useTranscricao";
import { deveFocarCampo } from "@/lib/transcricao/focoDoDitado";

export function BotaoDitado({ transcricao: t, disabled = false, campo }: {
  transcricao: Transcricao;
  disabled?: boolean;
  /** Campo que recebe o foco depois do clique (exceto em toque), para o Enter seguinte agir no campo e não no botão. */
  campo?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
}) {
  const ocupado = t.estado === "conectando" || t.estado === "finalizando";
  const rotulo = t.estado === "conectando" ? "Cancelar conexão do microfone"
    : t.estado === "finalizando" ? "Finalizando transcrição"
    : t.ativa ? "Parar ditado" : "Ditar por voz";
  return (
    <button
      type="button"
      onClick={(e) => {
        if (t.ativa) void t.parar();
        else void t.iniciar();
        if (deveFocarCampo((e.nativeEvent as Partial<PointerEvent>).pointerType)) campo?.current?.focus();
      }}
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

export function EstadoDitado({ transcricao: t, dica = "Ouvindo… Pare o ditado para revisar e enviar." }: {
  transcricao: Transcricao;
  /** O que aparece enquanto o microfone ouve e ainda não há texto parcial. */
  dica?: string;
}) {
  return (
    <>
      {t.ativa && (
        <div role="status" className="text-[12px] text-inherit opacity-75">
          {t.estado === "conectando" ? "Conectando o microfone…" : t.estado === "finalizando" ? "Finalizando transcrição…"
            : t.parcial || dica}
        </div>
      )}
      {t.erro && <p role="alert" className="text-[12px] text-red-600">{t.erro}</p>}
    </>
  );
}
