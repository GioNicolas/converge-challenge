import type { Blip } from "@/lib/contracts";

interface BlipBalloonProps {
  blip: Blip;
  onOpen: () => void;
  onSnooze: () => void;
}

/** Balão azul pulsando no canto superior direito do editor, com "agora não" ao lado. */
export function BlipBalloon({ blip, onOpen, onSnooze }: BlipBalloonProps) {
  return (
    <div className="absolute right-3 top-3 z-20 flex max-w-xs items-start gap-2">
      <button
        type="button"
        onClick={onSnooze}
        className="shrink-0 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-neutral-300 shadow-lg hover:bg-neutral-700"
      >
        agora não
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="animate-pulse rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white shadow-lg ring-2 ring-blue-300"
      >
        <span className="block text-[10px] uppercase opacity-80">entrevistador tem uma pergunta</span>
        <span className="block">{blip.preview}</span>
      </button>
    </div>
  );
}
