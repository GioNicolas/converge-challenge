"use client";

import { useEffect, useRef } from "react";
import { Mic, MicOff, X } from "lucide-react";
import type { ChatMessage } from "@/lib/contracts";
import type { VoiceStatus } from "./useVoice";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  voiceAvailable: boolean;
  voiceStatus: VoiceStatus;
  voiceError: string | null;
  onToggleVoice: () => void;
  onClose: () => void;
};

/** Painel de conversa: lista simples (sem balões), texto sempre disponível. */
export default function ConversationPanel(p: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.messages]);

  return (
    <section
      aria-label="Conversa"
      className="vidro absolute bottom-24 right-4 z-20 flex max-h-[60%] w-[340px] flex-col rounded-padrao shadow-flutuante"
    >
      <header className="flex items-center justify-between px-4 pt-3">
        <h2 className="titulo">Conversa</h2>
        <div className="flex items-center gap-1">
          {p.voiceAvailable && (
            <button
              type="button"
              onClick={p.onToggleVoice}
              disabled={p.voiceStatus === "connecting"}
              aria-label={p.voiceStatus === "on" ? "Desligar voz" : "Ligar voz"}
              className="rounded-full p-1.5 hover:bg-superficie-2"
            >
              {p.voiceStatus === "on" ? (
                <Mic size={18} strokeWidth={1.75} className="text-sucesso" />
              ) : (
                <MicOff size={18} strokeWidth={1.75} className="text-texto-suave" />
              )}
            </button>
          )}
          <button type="button" onClick={p.onClose} aria-label="Voltar a codar" className="rounded-full p-1.5 hover:bg-superficie-2">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-corpo">
        {p.messages.length === 0 && !p.busy && (
          <p className="label-pequena">Use o campo embaixo ou ligue a voz para falar com o entrevistador.</p>
        )}
        {p.messages.map((m, i) => (
          <p key={i}>
            <span className={`label-pequena ${m.role === "agent" ? "text-marca" : ""}`}>
              {m.role === "agent" ? "Entrevistador" : "Você"}
            </span>
            <br />
            {m.text}
          </p>
        ))}
        {p.busy && <p className="label-pequena">Pensando…</p>}
        {p.error && <p className="text-perigo">{p.error}</p>}
        {p.voiceError && (
          <p className="text-alerta">Voz indisponível ({p.voiceError}). Continue por texto.</p>
        )}
      </div>

    </section>
  );
}
