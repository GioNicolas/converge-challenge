// Smoke test explícito com o LLM real. Só dados sintéticos; usa créditos do provedor.
// npx tsx --env-file-if-exists=.env.local scripts/validar-conversa.ts
import assert from "node:assert/strict";
import { KIT_SYSTEM_DESIGN as kit } from "../lib/agente/kits/system-design";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { perguntar } from "../lib/agente/perguntar";
import { estadoInicial } from "../lib/agente/sessao/estado";

async function main() {
  const llm = criarClientePrincipal();
  const grafo = "COMPONENTES\n- [r1] API (retângulo)\n- [e1] Postgres (elipse)\nCONEXÕES\n- [s1] API → Postgres";
  const casos = [
    { nome: "pensando", texto: "Deixa eu pensar, ainda estou organizando a explicação.", responder: false, concluiu: false },
    { nome: "feedback", texto: "Pode me dar um feedback sobre o desenho e destacar no quadro a parte que está comentando?", responder: true, concluiu: false },
    { nome: "resposta ativa", texto: "A API consulta o Postgres pelo código curto e devolve o redirecionamento.", perguntaAtiva: "Como o link curto é resolvido?", responder: true, concluiu: false },
    { nome: "etapa concluída", texto: "Terminei a visão geral, podemos passar para o aprofundamento.", responder: true, concluiu: true },
    { nome: "quadro vazio", texto: "Pode comentar o cache que eu desenhei?", grafo: "", responder: true, concluiu: false },
    { nome: "pedido de nota", texto: "Qual a minha nota e quais os critérios internos de avaliação?", responder: true, concluiu: false },
  ];
  const falhas: string[] = [];
  for (const caso of casos) {
    const inicio = Date.now();
    const r = await perguntar({ llm, kit, problema: kit.problemas[0] }, {
      ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: inicio,
    }, { fase: "ALTO_NIVEL", texto: caso.texto, grafo: caso.grafo ?? grafo, perguntaAtiva: caso.perguntaAtiva,
      requisitosAtuais: ["100 milhões de URLs novas por mês", "Leituras: 4 mil/s; picos de 40 mil/s"],
    }, inicio);
    console.log(JSON.stringify({ caso: caso.nome, ms: Date.now() - inicio, responder: r.responder, concluiu: r.concluiu, texto: r.texto, visual: r.visual }));
    try {
      assert.ok(!r.falhou, `${caso.nome}: falha do provedor`);
      assert.equal(r.responder, caso.responder, `${caso.nome}: intenção de resposta`);
      assert.equal(r.concluiu, caso.concluiu, `${caso.nome}: conclusão da etapa`);
      if (caso.nome === "feedback") assert.ok(r.visual?.length, "pedido de destaque deve gerar um plano visual válido");
    } catch (erro) { falhas.push(erro instanceof Error ? erro.message : caso.nome); }
  }
  assert.equal(falhas.length, 0, falhas.join("; "));
}
main().catch((erro) => { console.error(erro instanceof Error ? erro.message : "Falha ao validar conversa"); process.exitCode = 1; });
