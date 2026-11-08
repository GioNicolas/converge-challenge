import assert from "node:assert/strict";
import test from "node:test";
import { findConfig } from "@/lib/config/store";
import { VAGAS_DE_VITRINE } from "@/lib/vagas/vitrine";

// O link do candidato (`/?config=<id>`) abre o quadro ou o IDE pelo `mode` da config no servidor. Se a config não
// existe, cai na padrão (live coding): uma vaga de system design do painel mandava o candidato para o IDE.
test("toda vaga do painel tem plano no servidor, no mesmo formato que o painel mostra", async () => {
  const comPlano = VAGAS_DE_VITRINE.filter((v) => v.resumo);
  assert.ok(comPlano.some((v) => v.resumo!.formato === "system_design"), "o painel deveria ter vagas de system design");
  for (const v of comPlano) {
    const config = await findConfig(v.resumo!.configId);
    assert.ok(config, `${v.id}: sem plano no servidor (${v.resumo!.configId})`);
    assert.equal(config.mode, v.resumo!.formato, `${v.id}: painel mostra ${v.resumo!.formato}, o link abre ${config.mode}`);
  }
});
