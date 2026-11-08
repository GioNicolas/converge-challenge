import type { ReactNode } from "react";
import "@/app/tema-recrutador.css";

/** Casca do tema claro (papel e tinta) usada pelas telas do recrutador e pelo agendamento.
 *  Sem ela a página cai no tema escuro do globals.css. */
export default function TemaRecrutador({ children }: { children: ReactNode }) {
  return <div className="tema-recrutador min-h-dvh">{children}</div>;
}
