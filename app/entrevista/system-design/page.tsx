import type { Metadata } from "next";
import SalaEntrevista from "@/components/SalaEntrevista";

export const metadata: Metadata = {
  title: "Entrevista de system design",
};

export default function Page() {
  // O quadro usa o tema claro (o resto do app é escuro); ver app/globals.css.
  return (
    <div className="tema-quadro-pagina contents">
      <SalaEntrevista />
    </div>
  );
}
