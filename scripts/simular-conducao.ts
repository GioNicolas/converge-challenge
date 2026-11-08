// Simula a condução no quadro com o LLM real: arquitetura completa desenhada, vaga de pleno e um candidato que
// diz "não sei" às duas primeiras perguntas. Confere se o Totti muda de assunto e não pergunta pelo que já está
// desenhado. Usa créditos do provedor.
// npx tsx --env-file-if-exists=.env.local scripts/simular-conducao.ts
import { analisar, type DepsAnalisar } from "../lib/agente/analisar";
import { KIT_SYSTEM_DESIGN as kit } from "../lib/agente/kits/system-design";
import { criarClientePrincipal } from "../lib/agente/llm/principal";
import { perguntar } from "../lib/agente/perguntar";
import { estadoInicial, transicionar, type EstadoSessao, type EventoSessao } from "../lib/agente/sessao/estado";
import type { PedidoAnalise } from "../lib/agente/sessao/tipos";

const GRAFO = `COMPONENTES
- [r1] Cliente (retângulo)
- [r2] Load balancer (retângulo)
- [r3] API de encurtamento (retângulo)
- [r4] Gerador de IDs (base62) (retângulo)
- [r5] Cache Redis (retângulo)
- [e1] Postgres primário (elipse)
- [e2] Réplica de leitura (elipse)
- [r6] Fila Kafka de cliques (retângulo)
- [r7] Worker de analytics (retângulo)
CONEXÕES
- [s1] Cliente → Load balancer
- [s2] Load balancer → API de encurtamento
- [s3] API de encurtamento → Gerador de IDs
- [s4] API de encurtamento → Cache Redis "lê primeiro"
- [s5] Cache Redis → Réplica de leitura "miss"
- [s6] API de encurtamento → Postgres primário "escreve"
- [s7] Postgres primário → Réplica de leitura "replica"
- [s8] API de encurtamento → Fila Kafka de cliques
- [s9] Fila Kafka de cliques → Worker de analytics`;

/** Respostas do candidato, na ordem das perguntas. */
const RESPOSTAS = [
  "Não sei, nunca trabalhei com isso.",
  "Também não sei te dizer, não tenho experiência com essa parte.",
  "Aí eu usaria TTL no cache e invalidaria quando o link for apagado.",
  "Acho que o worker processa em lote a cada minuto.",
];

const COMPONENTES = ["load balancer", "balanceador", "cache", "redis", "réplica", "replica", "fila", "kafka", "gerador", "worker", "postgres", "banco"];
const PERGUNTA_POR_EXISTENTE = /(onde|como) (você )?(colocaria|poria|adicionaria|incluiria)|você (colocaria|adicionaria|incluiria|usaria) (um|uma)|teria (um|uma)/i;

function palavras(t: string): Set<string> {
  return new Set(t.toLowerCase().match(/[a-zà-ú]{5,}/g) ?? []);
}
function sobreposicao(a: string, b: string): number {
  const A = palavras(a);
  const B = palavras(b);
  if (!A.size || !B.size) return 0;
  return [...A].filter((w) => B.has(w)).length / Math.min(A.size, B.size);
}

async function main() {
  const llm = criarClientePrincipal();
  const problema = kit.problemas[0];
  const deps: DepsAnalisar = { llm, kit, problema, log: () => {} };
  let t = Date.now();
  let estado: EstadoSessao = estadoInicial({
    criterios: kit.criterios.map((c) => c.id),
    plano: { cargo: "Desenvolvedor Backend Pleno", senioridade: "pleno", tom: "amigavel", dicas: "leves", foco: [{ area: "tecnico", peso: 0.6 }, { area: "escala_produto", peso: 0.4 }], notas: "", duracaoMin: 10 },
  });
  const aplicar = (ev: EventoSessao) => {
    const r = transicionar(estado, ev, t);
    estado = r.estado;
    return r.efeitos;
  };
  aplicar({ tipo: "COMECAR" });
  aplicar({ tipo: "APRESENTACAO_TERMINOU" });
  estado = { ...estado, fase: "APROFUNDAMENTO", faseIniciadaEm: t };

  const perguntas: string[] = [];
  const problemas: string[] = [];
  let anteriorFoiNaoSei = false;
  for (let rodada = 0; rodada < 6 && perguntas.length < RESPOSTAS.length; rodada++) {
    t += 70_000; // passa do intervalo mínimo entre perguntas
    const pedido: PedidoAnalise = {
      sessao_id: "simulacao",
      fase: estado.fase,
      grafo: GRAFO,
      mudancas: rodada === 0 ? GRAFO : "(nada mudou no desenho)",
      conversa_recente: estado.conversa.slice(-8).map(({ quem, texto }) => ({ quem, texto })),
      perguntas_feitas: estado.perguntasFeitas,
      imagem_url: null,
      parado_ha_s: 12,
    };
    const r = await analisar(deps, estado, pedido, t);
    estado = r.estado;
    const pergunta = r.resposta.pergunta;
    if (!pergunta || r.resposta.status === "ok") {
      console.log(`[rodada ${rodada + 1}] análise: ${r.resposta.status} (${r.diagnostico.origem}${r.diagnostico.ajustes.length ? `; ${r.diagnostico.ajustes.join(", ")}` : ""})`);
      continue;
    }
    const n = perguntas.length;
    console.log(`\nPergunta ${n + 1} [${r.resposta.status}${r.resposta.degrau ? `, degrau ${r.resposta.degrau}` : ""}]: ${pergunta}`);
    if (PERGUNTA_POR_EXISTENTE.test(pergunta) && COMPONENTES.some((c) => pergunta.toLowerCase().includes(c))) {
      problemas.push(`pergunta ${n + 1} pergunta por algo que já está no desenho`);
    }
    if (anteriorFoiNaoSei && sobreposicao(pergunta, perguntas[n - 1]) >= 0.5) {
      problemas.push(`pergunta ${n + 1} insiste no assunto da ${n} depois do "não sei"`);
    }
    if (anteriorFoiNaoSei && r.resposta.degrau && r.resposta.degrau > 1) problemas.push(`pergunta ${n + 1} subiu a escada depois do "não sei"`);
    perguntas.push(pergunta);

    aplicar({ tipo: "PLIN_CLICADO" });
    const resposta = RESPOSTAS[n];
    console.log(`Candidato: ${resposta}`);
    const p = await perguntar({ llm, kit, problema }, estado, { fase: estado.fase, texto: resposta, grafo: GRAFO, perguntaAtiva: pergunta }, t);
    estado = p.estado;
    console.log(`Totti: ${p.responder ? p.texto : "(em silêncio)"}`);
    if (n < 2 && p.responder && sobreposicao(p.texto, pergunta) >= 0.5 && /\?/.test(p.texto)) {
      problemas.push(`resposta ao "não sei" ${n + 1} refaz a pergunta`);
    }
    aplicar({ tipo: "CANDIDATO_FALOU", texto: resposta, fimDeResposta: true });
    anteriorFoiNaoSei = n < 2;
  }
  console.log(`\n${problemas.length ? `PROBLEMAS:\n- ${problemas.join("\n- ")}` : "OK: mudou de assunto e não perguntou pelo que já está desenhado"}`);
  process.exitCode = problemas.length ? 1 : 0;
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
