// Onde o recrutador está no fluxo: 01 VAGA · 02 CONVERSA · 03 REVISÃO (o atual com marca-texto).
const PASSOS = ["Vaga", "Conversa", "Revisão"];

export default function Passos({ atual }: { atual: 1 | 2 | 3 }) {
  return (
    <ol className="flex items-center gap-1" aria-label="Etapas">
      {PASSOS.map((nome, i) => {
        const n = i + 1;
        const ativo = n === atual;
        return (
          <li
            key={nome}
            aria-current={ativo ? "step" : undefined}
            className={`rotulo ${ativo ? "rotulo-destaque" : n < atual ? "text-texto" : "text-texto-suave/70"} px-1`}
          >
            {String(n).padStart(2, "0")} {nome}
          </li>
        );
      })}
    </ol>
  );
}
