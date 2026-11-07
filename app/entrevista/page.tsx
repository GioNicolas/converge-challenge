import IdeApp from "@/components/IdeApp";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { findConfig, normalizarConfig } from "@/lib/config/store";

/**
 * `?config=<id>` abre a entrevista da vaga (config gerada pela pré-entrevista); sem ele, a config padrão.
 * `?problema=<id>` só sobrescreve a questão em testes.
 */
export default async function Interview({ searchParams }: { searchParams: Promise<{ problema?: string; config?: string }> }) {
  const { problema, config } = await searchParams;
  const found = config ? await findConfig(config) : undefined;
  const vaga = normalizarConfig(found ?? DEFAULT_CONFIG);
  return <IdeApp problemId={problema} vaga={vaga} />;
}
