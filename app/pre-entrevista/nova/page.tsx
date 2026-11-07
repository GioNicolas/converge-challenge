import type { Metadata } from "next";
import { Geist } from "next/font/google";
import PreEntrevistaTotti from "@/components/pre-entrevista/PreEntrevistaTotti";
import "./tema.css";

// Fonte grotesca do tema da pré-entrevista (os rótulos usam a Geist Mono, que o layout já carrega).
const grotesca = Geist({ variable: "--font-grotesca", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nova entrevista · Converge",
};

export default function Page() {
  return (
    <div className={`tema-sable ${grotesca.variable} min-h-dvh`}>
      <PreEntrevistaTotti />
    </div>
  );
}
