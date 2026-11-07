"use client";

/** Legenda ao vivo, centralizada embaixo, até 2 linhas (design §8.5). */
export default function Caption({ text }: { text: string | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute bottom-[72px] left-1/2 z-10 w-[min(560px,60%)] -translate-x-1/2">
      {text && (
        <p className="vidro-escuro line-clamp-2 rounded-padrao px-4 py-2 text-center text-corpo-grande shadow-flutuante">
          {text}
        </p>
      )}
    </div>
  );
}
