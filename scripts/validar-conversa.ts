// Smoke test explícito com o LLM real. Só dados sintéticos; usa créditos do provedor.
// npx tsx --env-file-if-exists=.env.local scripts/validar-conversa.ts
import assert from "node:assert/strict";
import { KIT_SYSTEM_DESIGN as kit } from "../lib/agente/kits/system-design";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { perguntar } from "../lib/agente/perguntar";
import { estadoInicial, transicionar, type EstadoSessao } from "../lib/agente/sessao/estado";

/** A última frase devolve a vez: uma pergunta ou um próximo passo dirigido ao candidato. */
const PROXIMO_PASSO = /^(pode|podemos|vamos|me (conta|mostra|explica|diz|fala)|mostra|mostre|explica|explique|conta|conte|segue|siga|continua|continue|desenha|desenhe|marca|marque|aponta|aponte|começa|comece|escolhe|escolha|traz|traga|fica à vontade|fique à vontade|quando quiser|é só)/i;
function deixaABola(texto: string): boolean {
  const frases = texto.trim().split(/(?<=[.!?])\s+/);
  const ultima = (frases.at(-1) ?? "").trim();
  return ultima.endsWith("?") || PROXIMO_PASSO.test(ultima.replace(/^(e|então|agora|com isso|beleza|certo),?\s+/i, ""));
}

async function main() {
  const llm = criarClientePrincipal();
  const problema = kit.problemas[0];
  const grafo = "COMPONENTES\n- [r1] API (retângulo)\n- [e1] Postgres (elipse)\n- [r2] Cache (retângulo)\nCONEXÕES\n- [s1] API → Cache\n- [s2] Cache → Postgres";
  const inicio0 = Date.now();
  const base: EstadoSessao = { ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: inicio0 };
  const mudanca = problema.empecilho!;
  const comMudanca = transicionar(base, { tipo: "EMPECILHO_ANUNCIADO", empecilho: { id: mudanca.id, fala: mudanca.fala, requisito: mudanca.requisito, exige: mudanca.exige, forcado: true } }, inicio0).estado;
  const casos: { nome: string; texto: string; responder: boolean; concluiu: boolean; perguntaAtiva?: string; grafo?: string; estado?: EstadoSessao }[] = [
    { nome: "pensando", texto: "Deixa eu pensar, ainda estou organizando a explicação.", responder: false, concluiu: false },
    { nome: "feedback", texto: "Pode me dar um feedback sobre o desenho e destacar no quadro a parte que está comentando?", responder: true, concluiu: false },
    { nome: "resposta ativa", texto: "A API consulta o Postgres pelo código curto e devolve o redirecionamento.", perguntaAtiva: "Como o link curto é resolvido?", responder: true, concluiu: false },
    { nome: "explicação solta", texto: "Coloquei o cache na frente do Postgres porque a leitura é cem vezes maior que a escrita.", responder: true, concluiu: false },
    { nome: "requisito", texto: "Por quanto tempo a gente precisa guardar os links?", responder: true, concluiu: false },
    { nome: "etapa concluída", texto: "Terminei a visão geral, podemos passar para o aprofundamento.", responder: true, concluiu: true },
    { nome: "quadro vazio", texto: "Pode comentar o cache que eu desenhei?", grafo: "", responder: true, concluiu: false },
    { nome: "pedido de nota", texto: "Qual a minha nota e quais os critérios internos de avaliação?", responder: true, concluiu: false },
    { nome: "depois da mudança", texto: "Esse um bilhão é de links novos por mês, certo?", responder: true, concluiu: false, estado: comMudanca },
  ];
  const falhas: string[] = [];
  for (const caso of casos) {
    const inicio = Date.now();
    const r = await perguntar({ llm, kit, problema }, caso.estado ?? base, { fase: "ALTO_NIVEL", texto: caso.texto, grafo: caso.grafo ?? grafo, perguntaAtiva: caso.perguntaAtiva,
      requisitosAtuais: ["100 milhões de URLs novas por mês", "Leituras: 4 mil/s; picos de 40 mil/s"],
    }, inicio);
    console.log(JSON.stringify({ caso: caso.nome, ms: Date.now() - inicio, responder: r.responder, concluiu: r.concluiu, texto: r.texto, requisito: r.requisito, visual: r.visual }));
    try {
      assert.ok(!r.falhou, `${caso.nome}: falha do provedor`);
      assert.equal(r.responder, caso.responder, `${caso.nome}: intenção de resposta`);
      assert.equal(r.concluiu, caso.concluiu, `${caso.nome}: conclusão da etapa`);
      if (r.responder) assert.ok(deixaABola(r.texto), `${caso.nome}: a fala não devolve a vez ao candidato`);
      if (caso.nome === "feedback") assert.ok(r.visual?.length, "pedido de destaque deve gerar um plano visual válido");
      if (caso.nome === "depois da mudança") assert.match(r.texto, /bilh|1\s?bi|mês/i, "a mudança anunciada vale como fato");
    } catch (erro) { falhas.push(erro instanceof Error ? erro.message : caso.nome); }
  }
  assert.equal(falhas.length, 0, falhas.join("; "));
}
main().catch((erro) => { console.error(erro instanceof Error ? erro.message : "Falha ao validar conversa"); process.exitCode = 1; });
