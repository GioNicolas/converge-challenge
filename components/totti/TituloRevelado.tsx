// Título que entra palavra por palavra, subindo de trás de uma máscara (700ms, 50ms entre palavras).
// O motion chamativo do site, usado só nos títulos de página. Com "reduzir movimento", aparece direto (globals.css).
// Server-safe: só CSS, sem estado.
export default function TituloRevelado({ texto, atraso = 0 }: { texto: string; atraso?: number }) {
  const palavras = texto.split(" ");
  return (
    <span aria-label={texto} className="inline">
      {palavras.map((p, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom">
          <span
            className="inline-block"
            style={{ animation: `revelar-palavra 0.7s var(--curva-saida) ${(atraso + i * 0.05).toFixed(2)}s both` }}
          >
            {p}
            {i < palavras.length - 1 ? " " : ""}
          </span>
        </span>
      ))}
    </span>
  );
}
