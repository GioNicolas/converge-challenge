import type { Metadata } from "next";
import "../tema-recrutador.css";

export const metadata: Metadata = {
  title: "Escolha seu horário · Entrevista técnica",
  // Link pessoal do candidato: nada de indexar.
  robots: { index: false, follow: false },
};

/** Mesmo tema claro do site (papel e tinta). Sem ele a página cai no tema escuro do globals.css. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="tema-recrutador min-h-dvh">{children}</div>;
}
