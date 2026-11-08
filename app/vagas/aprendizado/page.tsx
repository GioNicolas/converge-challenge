"use client";

// Endereço antigo da memória da squad. A memória agora é uma aba da vaga ("O que o Totti aprendeu"):
// /vagas/aprendizado?vaga=X abre a aba da vaga X (pelo id da vaga ou da config dela); sem vaga, a lista de vagas.
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVagas } from "@/lib/vagas/workspace";

function Redirecionar() {
  const router = useRouter();
  const pedida = useSearchParams().get("vaga");
  const { vagas } = useVagas();

  useEffect(() => {
    if (!pedida) return router.replace("/vagas");
    if (vagas === null) return;
    const vaga = vagas.find((v) => v.id === pedida || v.resumo?.configId === pedida);
    router.replace(vaga ? `/vagas/vaga?id=${encodeURIComponent(vaga.id)}&etapa=aprendizado` : "/vagas");
  }, [pedida, vagas, router]);

  return null;
}

export default function Page() {
  return (
    <Suspense>
      <Redirecionar />
    </Suspense>
  );
}
