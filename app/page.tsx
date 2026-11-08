import PreInterview from "@/components/PreInterview";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { findConfig, normalizarConfig } from "@/lib/config/store";
import { ENTREVISTA_ID_VALIDO } from "@/lib/convites/store";

export const metadata = { title: "Converge — Antes de começar" };

/** `?config=<id>` mostra a vaga da recrutadora e leva a entrevista para a mesma config; sem ele, a padrão. */
export default async function Home({ searchParams }: { searchParams: Promise<{ config?: string; convite?: string }> }) {
  const { config, convite } = await searchParams;
  const found = config ? await findConfig(config) : undefined;
  // `?convite=` (link do e-mail de confirmação) segue até a entrevista, pra ela ficar no nome do candidato.
  const conviteValido = convite && ENTREVISTA_ID_VALIDO.test(convite) ? convite : undefined;
  return <PreInterview vaga={normalizarConfig(found ?? DEFAULT_CONFIG)} convite={conviteValido} />;
}
