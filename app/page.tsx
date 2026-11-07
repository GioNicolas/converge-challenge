import PreInterview from "@/components/PreInterview";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { findConfig, normalizarConfig } from "@/lib/config/store";

export const metadata = { title: "Converge — Antes de começar" };

/** `?config=<id>` mostra a vaga da recrutadora e leva a entrevista para a mesma config; sem ele, a padrão. */
export default async function Home({ searchParams }: { searchParams: Promise<{ config?: string }> }) {
  const { config } = await searchParams;
  const found = config ? await findConfig(config) : undefined;
  return <PreInterview vaga={normalizarConfig(found ?? DEFAULT_CONFIG)} />;
}
