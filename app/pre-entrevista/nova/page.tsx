import type { Metadata } from "next";
import PreEntrevistaTotti from "@/components/pre-entrevista/PreEntrevistaTotti";
import "../../tema-recrutador.css";

export const metadata: Metadata = {
  title: "Nova entrevista · Converge",
};

export default function Page() {
  return (
    <div className={`tema-recrutador min-h-dvh`}>
      <PreEntrevistaTotti />
    </div>
  );
}
