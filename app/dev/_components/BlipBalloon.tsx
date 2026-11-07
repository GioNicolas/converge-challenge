import type { Blip } from "@/lib/contracts";

interface BlipBalloonProps {
  blip: Blip;
  onOpen: () => void;
}

/** Balão azul pulsando no canto superior direito do editor. */
export function BlipBalloon({ blip, onOpen }: BlipBalloonProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute right-3 top-3 z-20 max-w-xs animate-pulse rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white shadow-lg ring-2 ring-blue-300"
    >
      <span className="block text-[10px] uppercase opacity-80">entrevistador tem uma pergunta</span>
      <span className="block">{blip.preview}</span>
    </button>
  );
}
