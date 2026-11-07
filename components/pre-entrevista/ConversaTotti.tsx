"use client";

// A conversa com a Totti. As falas dela em texto limpo; as do recrutador num balão discreto à direita.
// No topo, o anel de voz da Totti: pensando enquanto ela responde, falando quando chega uma fala nova.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import OndaDeVoz from "@/components/agente/OndaDeVoz";
import type { Turno } from "@/lib/pre-entrevista/rascunho";
import { curvaSuave } from "@/lib/design/motion";

type Props = {
  transcricao: Turno[];
  pensando: boolean;
  erro: string | null;
  onEnviar: (texto: string) => void;
};

export default function ConversaTotti({ transcricao, pensando, erro, onEnviar }: Props) {
  const [texto, setTexto] = useState("");
  const lista = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Fala nova da Totti: o anel fica "falando" por um instante.
  const falasDaTotti = transcricao.filter((t) => t.role === "agente").length;
  const [falando, setFalando] = useState(false);
  useEffect(() => {
    if (falasDaTotti === 0) return;
    setFalando(true);
    const t = setTimeout(() => setFalando(false), 2200);
    return () => clearTimeout(t);
  }, [falasDaTotti]);

  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: "smooth" });
  }, [transcricao.length, pensando]);

  // O campo cresce com o texto, até um limite.
  useEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 140)}px`;
  }, [texto]);

  function enviar() {
    const t = texto.trim();
    if (!t || pensando) return;
    onEnviar(t);
    setTexto("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <section className="vidro flex min-h-0 flex-col overflow-hidden rounded-padrao shadow-cartao">
      <header className="flex items-center gap-3 border-b border-borda px-4 py-3">
        <OndaDeVoz estado={pensando ? "pensando" : falando ? "falando" : "ouvindo"} tamanho={40} />
        <div className="flex flex-col">
          <span className="titulo text-subtitulo text-texto">Totti</span>
          <span className="text-mini text-texto-suave">
            {pensando ? "Pensando…" : "Monta a entrevista com você"}
          </span>
        </div>
      </header>

      <div ref={lista} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
        <AnimatePresence initial={false}>
          {transcricao.map((t, i) =>
            t.role === "agente" ? (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.36, ease: curvaSuave }}
                className="flex max-w-[92%] gap-2.5"
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-marca shadow-[0_0_10px_var(--marca)]" />
                <p className="text-corpo-grande leading-relaxed whitespace-pre-wrap text-texto">{t.text}</p>
              </motion.div>
            ) : (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.28, ease: curvaSuave }}
                className="ml-auto max-w-[85%] rounded-[16px] rounded-br-[6px] bg-superficie-2 px-3.5 py-2.5"
              >
                <p className="text-corpo-grande leading-relaxed whitespace-pre-wrap text-texto">{t.text}</p>
              </motion.div>
            ),
          )}
          {pensando && (
            <motion.div
              key="pensando"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 pl-4"
              aria-label="A Totti está respondendo"
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="size-1.5 rounded-full bg-marca/70"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {erro && <p className="mx-4 mb-2 rounded-controle bg-perigo/15 px-3 py-2 text-corpo text-perigo">{erro}</p>}

      <div className="border-t border-borda p-3">
        <div className="flex items-end gap-2 rounded-[20px] border border-borda bg-superficie-2/60 py-1.5 pr-1.5 pl-3.5 transition-[border-color,box-shadow] duration-rapida ease-suave focus-within:border-marca focus-within:shadow-[0_0_0_3px_var(--marca-suave)]">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={aoTeclar}
            rows={1}
            placeholder="Responda à Totti…"
            aria-label="Mensagem para a Totti"
            className="max-h-[140px] flex-1 resize-none bg-transparent py-1.5 text-corpo-grande text-texto outline-none placeholder:text-texto-suave/70"
          />
          <button
            onClick={enviar}
            disabled={!texto.trim() || pensando}
            aria-label="Enviar"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca text-texto-claro transition-[opacity,transform] duration-rapida ease-suave active:scale-90 disabled:opacity-30"
          >
            <ArrowUp size={17} strokeWidth={2.2} />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-mini text-texto-suave/70">Enter envia · Shift + Enter quebra a linha</p>
      </div>
    </section>
  );
}
