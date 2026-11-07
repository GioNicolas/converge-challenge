import IdeApp from "@/components/IdeApp";

/** `?problema=<id>` só sobrescreve a questão em testes; normalmente ela vem da config da vaga (nível definido pelo agente). */
export default async function Interview({ searchParams }: { searchParams: Promise<{ problema?: string }> }) {
  const { problema } = await searchParams;
  return <IdeApp problemId={problema} />;
}
