import IdeApp from "@/components/IdeApp";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { comQuestaoSorteada, findConfig, normalizarConfig } from "@/lib/config/store";

export const dynamic = "force-dynamic";

/**
 * `?config=<id>` abre a entrevista da vaga (config gerada pela pré-entrevista); sem ele, a config padrão.
 * A questão é sorteada a cada entrevista entre as que servem à vaga; `?problema=<id>` fixa uma em testes.
 */
export default async function Interview({ searchParams }: { searchParams: Promise<{ problema?: string; config?: string }> }) {
  const { problema, config } = await searchParams;
  const found = config ? await findConfig(config) : undefined;
  const vaga = comQuestaoSorteada(normalizarConfig(found ?? DEFAULT_CONFIG));
  return <IdeApp problemId={problema} vaga={vaga} />;
}
