import { Suspense } from "react";
import Aprendizado from "@/components/vagas/Aprendizado";

export const metadata = { title: "O que o Totti aprendeu" };

export default function Page() {
  return (
    <Suspense>
      <Aprendizado />
    </Suspense>
  );
}
