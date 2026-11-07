import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ChatMessage } from "@/lib/contracts";

interface ChatPanelProps {
  open: boolean;
  blipId: string | undefined;
  messages: ChatMessage[];
  busy: boolean;
  /** O entrevistador encerrou a conversa: input travado e o painel fecha sozinho. */
  ended?: boolean;
  error: string | null;
  disabled: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
  onOpenFree: () => void;
}

const BTN = "border border-neutral-600 bg-neutral-800 px-3 py-1 hover:bg-neutral-700 disabled:opacity-40";

/** Conversa por texto com o entrevistador. */
export function ChatPanel({
  open,
  blipId,
  messages,
  busy,
  ended = false,
  error,
  disabled,
  onSend,
  onClose,
  onOpenFree,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!open) {
    return (
      <section className="border border-neutral-800 p-3">
        <h2 className="mb-2 font-bold">Conversa (texto)</h2>
        <button type="button" onClick={onOpenFree} disabled={disabled} className={BTN}>
          Chamar entrevistador
        </button>
      </section>
    );
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = draft.trim();
    if (text === "" || busy || disabled || ended) return;
    setDraft("");
    onSend(text);
  };

  return (
    <section className="flex flex-col border border-neutral-800 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-bold">
          Conversa {blipId !== undefined ? `(blip ${blipId.slice(0, 8)})` : "(sem blip)"}
        </h2>
        <button type="button" onClick={onClose} className={BTN}>
          Voltar a codar
        </button>
      </div>

      <div ref={listRef} className="mb-2 flex h-72 flex-col gap-2 overflow-y-auto border border-neutral-800 p-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap border px-2 py-1 ${
              m.role === "agent"
                ? "self-start border-blue-800 bg-blue-950"
                : "self-end border-neutral-700 bg-neutral-800"
            }`}
          >
            <span className="block text-[10px] text-neutral-500">
              {m.role === "agent" ? "entrevistador" : "candidato"}
            </span>
            {m.text}
          </div>
        ))}
        {busy && <div className="self-start text-neutral-500">digitando…</div>}
        {ended && <div className="self-center text-xs text-neutral-500">conversa encerrada</div>}
      </div>

      {error !== null && <div className="mb-2 text-red-400">{error}</div>}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy || disabled || ended}
          placeholder="responda ao entrevistador"
          className="min-w-0 flex-1 border border-neutral-700 bg-neutral-900 px-2 py-1 outline-none"
        />
        <button type="submit" disabled={busy || disabled || ended || draft.trim() === ""} className={BTN}>
          Enviar
        </button>
      </form>
    </section>
  );
}
