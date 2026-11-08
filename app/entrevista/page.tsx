import { redirect } from "next/navigation";
import IdeApp from "@/components/IdeApp";
import { DEFAULT_CONFIG } from "@/lib/config/default";
import { comQuestaoSorteada, findConfig, normalizarConfig } from "@/lib/config/store";
import { ENTREVISTA_ID_VALIDO } from "@/lib/convites/store";

export const dynamic = "force-dynamic";

/**
 * `?config=<id>` abre a entrevista da vaga (config gerada pela pré-entrevista); sem ele, a config padrão.
 * A questão é sorteada a cada entrevista entre as que servem à vaga; `?problema=<id>` fixa uma em testes.
 */
export default async function Interview({ searchParams }: { searchParams: Promise<{ problema?: string; config?: string; convite?: string }> }) {
  const { problema, config, convite } = await searchParams;
  const found = config ? await findConfig(config) : undefined;
  const conviteValido = convite && ENTREVISTA_ID_VALIDO.test(convite) ? convite : undefined;
  // Plano de system design não abre o IDE: vai para o quadro, com a mesma config e o mesmo convite.
  if (found?.mode === "system_design") {
    redirect(`/entrevista/system-design?config=${encodeURIComponent(found.id)}${conviteValido ? `&convite=${conviteValido}` : ""}`);
  }
  const vaga = comQuestaoSorteada(normalizarConfig(found ?? DEFAULT_CONFIG));
  return <IdeApp problemId={problema} vaga={vaga} convite={conviteValido} />;
}
