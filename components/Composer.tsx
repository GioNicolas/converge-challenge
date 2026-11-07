"use client";

import { useState, type FormEvent } from "react";
import { SendHorizontal } from "lucide-react";

/** Campo de digitação fixo, sempre visível: fala com o entrevistador por texto. */
export default function Composer({
  busy,
  disabled,
  onSend,
}: {
  busy: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy || disabled) return;
    setDraft("");
    onSend(text);
  };

  return (
    <form
      onSubmit={submit}
      className="vidro mx-auto mt-2 flex w-[min(560px,100%)] shrink-0 items-center gap-2 rounded-full py-1.5 pl-5 pr-1.5 shadow-flutuante"
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={busy || disabled}
        placeholder="Fale com o entrevistador…"
        aria-label="Mensagem para o entrevistador"
        className="min-w-0 flex-1 bg-transparent text-corpo-grande text-texto outline-none placeholder:text-texto-suave"
      />
      <button
        type="submit"
        aria-label="Enviar"
        disabled={busy || disabled || !draft.trim()}
        className="grid h-9 w-9 place-items-center rounded-full bg-marca text-texto-claro disabled:opacity-40"
      >
        <SendHorizontal size={16} strokeWidth={1.75} />
      </button>
    </form>
  );
}
