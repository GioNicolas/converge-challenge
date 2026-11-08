import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PreInterview from "@/components/PreInterview";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { findConfig, normalizarConfig } from "@/lib/config/store";
import { ENTREVISTA_ID_VALIDO } from "@/lib/convites/store";
import { COOKIE_ONBOARDING } from "@/lib/vagas/onboarding";

export const metadata = { title: "Converge — Antes de começar" };

/**
 * `?config=<id>` (o link do candidato) mostra a vaga e leva a entrevista para a mesma config.
 * Sem `?config=`, quem chega pelo domínio é a recrutadora: na primeira visita passa pelo onboarding
 * (/boas-vindas); depois, com o cookie que ele grava, vai direto para o painel de vagas.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ config?: string; convite?: string }> }) {
  const { config, convite } = await searchParams;
  if (!config) redirect((await cookies()).has(COOKIE_ONBOARDING) ? "/vagas" : "/boas-vindas");
  const found = await findConfig(config);
  // `?convite=` (link do e-mail de confirmação) segue até a entrevista, pra ela ficar no nome do candidato.
  const conviteValido = convite && ENTREVISTA_ID_VALIDO.test(convite) ? convite : undefined;
  return <PreInterview vaga={normalizarConfig(found ?? DEFAULT_CONFIG)} convite={conviteValido} />;
}
