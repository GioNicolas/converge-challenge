import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { criarRepositorioEmMemoria } from "@/lib/agente/armazenamento";
import { criarClienteFalso } from "@/lib/agente/llm/cliente";
import { definirContextoParaTestes } from "@/lib/agente/rotas/contexto";
import { estadoInicial } from "@/lib/agente/sessao/estado";
import { POST as fechar } from "../sessoes/[id]/fechamento/route";
import { POST as perguntar } from "../sessoes/[id]/perguntar/route";
import { POST as analisar } from "../sessoes/[id]/analisar/route";

const AGORA = 1_800_000_000_000;
const GRAFO = "COMPONENTES\n- [r1] Cliente (retângulo)\n- [r2] API (retângulo)\n- [r3] Banco (retângulo)\nCONEXÕES\n- [s1] Cliente → API\n- [s2] API → Banco";
let repo = criarRepositorioEmMemoria();
let relogio = AGORA;
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (dados: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
/** `mudancaAnunciada`: a mudança de cenário já saiu (sem ela, "terminei" é barrado: decisão F, #129). */
async function sessao(restanteMin = 20, mudancaAnunciada = false) {
  return repo.criar({ avaliacaoId: "demo", candidatoId: "teste", estado: {
    ...estadoInicial(), fase: "ALTO_NIVEL", faseIniciadaEm: AGORA - 60_000,
    iniciadaEm: AGORA - (35 - restanteMin) * 60_000,
    ...(mudancaAnunciada ? { empecilho: { id: "teste_mudanca", fala: "Mudança.", requisito: "Mudança", exige: "Rever.", anunciadoEm: AGORA - 60_000, fase: "ALTO_NIVEL" as const, forcado: false } } : {}),
  } });
}
beforeEach(() => {
  repo = criarRepositorioEmMemoria(); relogio = AGORA;
  definirContextoParaTestes({ repositorio: repo, llm: null, agora: () => relogio });
});
afterEach(() => definirContextoParaTestes(null));

test("relógio inicia sem LLM nem fala inventada e repetir não consome perguntas", async () => {
  const s = await sessao(2.5);
  const req = () => post({ fase: "ALTO_NIVEL", grafo: GRAFO, gatilho: "tempo" });
  const primeira = await (await fechar(req(), params(s.id))).json();
  assert.equal(primeira.fechamento, "perguntas_finais");
  assert.match(primeira.texto, /^O nosso tempo está acabando\./);
  const antes = (await repo.obter(s.id))!.estado;
  assert.equal(antes.fase, "FECHAMENTO");
  assert.equal(antes.conversa.some((f) => f.quem === "candidato"), false);
  assert.deepEqual(await (await fechar(req(), params(s.id))).json(), primeira);
  assert.deepEqual((await repo.obter(s.id))!.estado.fechamento, antes.fechamento);
});

test("relógio não antecipa fechamento quando ainda há tempo; pedido explícito despede", async () => {
  const s = await sessao();
  const cedo = await (await fechar(post({ fase: "ALTO_NIVEL", gatilho: "tempo" }), params(s.id))).json();
  assert.equal(cedo.responder, false);
  assert.equal((await repo.obter(s.id))!.estado.fechamento, undefined);
  const fim = await (await fechar(post({ fase: "ALTO_NIVEL", gatilho: "pediu_encerrar" }), params(s.id))).json();
  assert.equal(fim.encerrar, true);
  assert.match(fim.texto, /Obrigado/);
});

test("relógio fecha no limiar do quadro (15% da entrevista): faltando 5 min de 35, já fecha (os 3 min de antes não fechavam)", async () => {
  const s = await sessao(5);
  const r = await (await fechar(post({ fase: "ALTO_NIVEL", gatilho: "tempo" }), params(s.id))).json();
  assert.equal(r.responder, true);
  assert.notEqual(r.fechamento, undefined);
  assert.equal((await repo.obter(s.id))!.estado.fechamento?.nucleo.gatilho, "tempo");
});

test("rotas preservam fechamento entre turnos, bloqueiam análise e seguem até despedida", async () => {
  const s = await sessao(20, true);
  const llm = criarClienteFalso([
    { responder: false, texto: "", requisito: null, concluiu: true },
    { status: "duvida", pergunta: "O banco aguenta o volume?", nota: "Banco", elementos: ["r3"], degrau: null, observacoes: [] },
    ...Array.from({ length: 4 }, () => ({ responder: true, texto: "Certo.", requisito: null, desfecho: "respondeu" })),
    { responder: false, texto: "", requisito: null },
  ]);
  definirContextoParaTestes({ repositorio: repo, llm, agora: () => relogio });
  const turno = async (texto: string) => {
    relogio += 10_000;
    const res = await perguntar(post({ sessao_id: s.id, fase: "ALTO_NIVEL", texto, grafo: GRAFO }), params(s.id));
    assert.equal(res.status, 200);
    return res.json();
  };
  let r = await turno("Eu acho que é isso, terminei.");
  assert.match(r.texto, /Só preciso fechar/);
  const analise = await (await analisar(post({ sessao_id: s.id, fase: "FECHAMENTO", grafo: GRAFO, mudancas: "", conversa_recente: [], perguntas_feitas: 0, imagem_url: null }), params(s.id))).json();
  assert.equal(analise.status, "ok");
  assert.equal(analise.fechamento, "perguntas_finais");
  for (let i = 0; i < 4 && r.fechamento === "perguntas_finais"; i++) {
    r = await turno("Eu separaria o serviço de leitura do serviço de escrita.");
    assert.doesNotMatch(r.texto, /Pode seguir|Continua daí|retomar o desenho/);
  }
  assert.equal(r.fechamento, "ultima_palavra");
  r = await turno("não, pode encerrar");
  assert.equal(r.encerrar, true);
  assert.match(r.texto, /Obrigado/);
  assert.equal((await repo.obter(s.id))!.estado.fechamento!.nucleo.etapa, "encerrada");
});
