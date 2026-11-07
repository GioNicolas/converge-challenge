// O caminho de criação de uma vaga com o Totti: 01 Vaga · 02 Leitura · 03 Plano · 04 Link.
// O atual em tinta cheia, os anteriores em preto com traço, os próximos apagados.
export const PASSOS_CRIACAO = ["Vaga", "Leitura", "Plano", "Link"] as const;

export default function Passos({ atual }: { atual: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label="Etapas da criação da vaga">
      {PASSOS_CRIACAO.map((nome, i) => {
        const n = i + 1;
        const ativo = n === atual;
        return (
          <li key={nome} className="flex items-center gap-1">
            {i > 0 && <span className={`h-px w-4 ${n <= atual ? "bg-texto/60" : "bg-borda"}`} aria-hidden />}
            <span
              aria-current={ativo ? "step" : undefined}
              className={`rotulo ${ativo ? "rotulo-destaque" : n < atual ? "px-1.5 text-texto" : "px-1.5 text-texto-suave/60"}`}
            >
              {String(n).padStart(2, "0")} {nome}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
