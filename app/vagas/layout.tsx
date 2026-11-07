import type { Metadata } from "next";
import "../tema-recrutador.css";

export const metadata: Metadata = {
  title: "Vagas · Converge",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className={`tema-recrutador min-h-dvh`}>{children}</div>;
}
