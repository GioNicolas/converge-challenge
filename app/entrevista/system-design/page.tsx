import type { Metadata } from "next";
import SalaEntrevista from "@/components/SalaEntrevista";

export const metadata: Metadata = {
  title: "Entrevista de system design",
};

export default function Page() {
  return <SalaEntrevista />;
}
