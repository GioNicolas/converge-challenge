import type { Metadata } from "next";
import Perola from "@/components/totti/Perola";
import TemaRecrutador from "@/components/TemaRecrutador";

export const metadata: Metadata = {
  title: "Obrigado",
};

/** Fim da entrevista para o candidato. O relatório vai só para a recrutadora. */
export default async function Obrigado({ searchParams }: { searchParams?: Promise<{ debug?: string; sessao?: string }> }) {
  const busca = await searchParams;
  return (
    <TemaRecrutador>
      <main className="grid min-h-dvh place-items-center p-6">
        <section className="anim-subir flex w-full max-w-md flex-col items-center gap-5 text-center">
          <Perola tamanho={44} />
          <h1 className="font-display text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-texto">
            Obrigado pela conversa.
          </h1>
          <p className="text-[17px] leading-relaxed text-texto-suave">
            Foi um prazer ver você pensar em voz alta. A recrutadora recebe o relatório da sua entrevista e
            volta a falar com você sobre os próximos passos. Pode fechar esta janela.
          </p>
          {busca?.debug === "1" && busca.sessao && (
            <a href={`/relatorio/${encodeURIComponent(busca.sessao)}`} className="text-sm text-texto-suave underline">
              Demo: ver o relatório da recrutadora
            </a>
          )}
          <span className="font-display text-[18px] leading-none font-bold tracking-[-0.02em] text-texto">totti</span>
        </section>
      </main>
    </TemaRecrutador>
  );
}
