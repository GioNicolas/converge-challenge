"use client";

// O corpo do Totti: uma pérola off-white. No escuro brilha; no papel ganha contorno.
// Quatro estados, cada um com um movimento próprio (sistema de design, "Movimento"):
//   ocioso   respira em 4s, escala 1 → 1,06
//   ouvindo  ondas em creme: é a voz do candidato chegando
//   pensando arco girando em 1,4s, linear
//   falando  ondas mais rápidas e a pérola pulsa no ritmo da voz
//   duvida   um anel chama atenção sem agitar
// Só transform e opacity animam. "Reduzir movimento" para tudo (ver globals.css).
export type EstadoPerola = "ocioso" | "ouvindo" | "pensando" | "falando" | "duvida";

const ROTULO: Record<EstadoPerola, string> = {
  ocioso: "Totti",
  ouvindo: "Totti ouvindo",
  pensando: "Totti pensando",
  falando: "Totti falando",
  duvida: "Totti tem uma dúvida",
};

type Props = {
  estado?: EstadoPerola;
  /** Lado da pérola em px. Os anéis passam dele. */
  tamanho?: number;
  /** Halo de luz atrás da pérola (no escuro). */
  brilho?: boolean;
  className?: string;
};

export default function Perola({ estado = "ocioso", tamanho = 44, brilho = false, className = "" }: Props) {
  const ondas = estado === "ouvindo" || estado === "falando" || estado === "duvida";
  const duracao = estado === "falando" ? 2.6 : estado === "duvida" ? 3.2 : 3;
  const respira = estado === "ocioso" || estado === "ouvindo" || estado === "duvida";
  return (
    <span
      role="img"
      aria-label={ROTULO[estado]}
      data-estado={estado}
      className={`relative inline-block shrink-0 ${className}`}
      style={{ width: tamanho, height: tamanho }}
    >
      {ondas && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-marca"
            style={{ animation: `onda ${duracao}s ease-out infinite` }}
          />
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-marca"
            style={{ animation: `onda ${duracao}s ease-out ${duracao / 3}s infinite` }}
          />
        </>
      )}
      {estado === "pensando" && (
        <span
          aria-hidden
          className="absolute -inset-[6px] rounded-full"
          style={{
            background: "conic-gradient(from 0deg, transparent 0 55%, var(--marca) 100%)",
            WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
            animation: "girar 1.4s linear infinite",
          }}
        />
      )}
      <span
        aria-hidden
        className="perola absolute inset-0 rounded-full"
        style={{
          animation: respira
            ? `respirar ${estado === "ouvindo" ? 3 : 4}s ease-in-out infinite`
            : estado === "falando"
              ? "respirar 2.4s ease-in-out infinite"
              : undefined,
          opacity: estado === "pensando" ? 0.85 : 1,
          boxShadow: brilho
            ? `0 ${tamanho * 0.3}px ${tamanho * 0.8}px -${tamanho * 0.2}px rgb(245 240 232 / 0.6), inset 0 0 0 1px rgb(28 24 18 / 0.14)`
            : undefined,
        }}
      />
    </span>
  );
}

/** As barras de voz do Totti (estado "falando"/"ouvindo"): altura vem de scaleY, só transform anima. Usam a cor do texto onde estão. */
export function BarrasDeVoz({
  ativo = true,
  n = 9,
  altura = 24,
  largura = 4,
  className = "",
}: {
  ativo?: boolean;
  n?: number;
  altura?: number;
  largura?: number;
  className?: string;
}) {
  return (
    <span aria-hidden className={`flex items-center ${className}`} style={{ gap: largura, height: altura }}>
      {Array.from({ length: n }, (_, j) => (
        <span
          key={j}
          className="rounded-full"
          style={{
            width: largura,
            height: altura,
            background: ativo ? "currentColor" : "color-mix(in srgb, currentColor 25%, transparent)",
            animation: ativo ? `barra ${(0.6 + ((j * 37) % 7) / 10).toFixed(2)}s ease-in-out ${((j * 0.07) % 0.5).toFixed(2)}s infinite` : undefined,
            transform: ativo ? undefined : "scaleY(.25)",
          }}
        />
      ))}
    </span>
  );
}
