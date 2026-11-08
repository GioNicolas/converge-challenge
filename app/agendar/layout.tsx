import type { Metadata } from "next";
import TemaRecrutador from "@/components/TemaRecrutador";

export const metadata: Metadata = {
  title: "Escolha seu horário · Entrevista técnica",
  // Link pessoal do candidato: nada de indexar.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <TemaRecrutador>{children}</TemaRecrutador>;
}
