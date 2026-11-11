import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../route";
import { definirContextoParaTestes } from "@/lib/agente/rotas/contexto";
import { criarRepositorioEmMemoria } from "@/lib/agente/armazenamento";
import { getOrCreateSession } from "@/lib/session/store";

afterEach(() => definirContextoParaTestes(null));
const req = (corpo: unknown) => new Request("http://localhost/api/uso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
const transcricao = (contexto: string) => ({ contexto, escuta_id: "escuta-1", audioEnviadoS: 3, sessaoS: 8, conexoes: 1, reconexoes: 0, final: false });

test("grava uso no quadro e no live coding", async () => {
  const repo = criarRepositorioEmMemoria();
  const sessao = await repo.criar({ avaliacaoId: "a", candidatoId: "c", estado: {} as never });
  definirContextoParaTestes({ repositorio: repo, llm: null });
  assert.equal((await POST(req({ sessao_id: sessao.id, contexto: "quadro", tipo: "transcricao_uso", dados: transcricao("quadro") }))).status, 200);
  assert.equal((await repo.listarEventos(sessao.id)).at(-1)?.tipo, "transcricao_uso");
  const live = getOrCreateSession("live-test");
  assert.equal((await POST(req({ sessao_id: live.sessionId, contexto: "coding", tipo: "transcricao_uso", dados: transcricao("coding") }))).status, 200);
  assert.equal(live.events.at(-1)?.type, "transcricao_uso");
  assert.equal((await POST(req({ sessao_id: live.sessionId, contexto: "coding", tipo: "voz_descartada", dados: { caracteres: 5, motivo: "substituida" } }))).status, 200);
  assert.equal(live.events.at(-1)?.type, "voz_descartada");
});

test("campos obrigatórios variam por tipo", async () => {
  const live = getOrCreateSession("uso-tipo");
  assert.equal((await POST(req({ sessao_id: live.sessionId, contexto: "coding", tipo: "transcricao_uso", dados: { escuta_id: "x" } }))).status, 400);
  assert.equal((await POST(req({ sessao_id: live.sessionId, contexto: "coding", tipo: "voz_descartada", dados: { caracteres: 3, motivo: "cancelada" } }))).status, 200);
});

test("rejeita tipo inválido, sessão ausente e corpo grande", async () => {
  const repo = criarRepositorioEmMemoria();
  definirContextoParaTestes({ repositorio: repo, llm: null });
  assert.equal((await POST(req({ sessao_id: "x", contexto: "quadro", tipo: "outro", dados: transcricao("quadro") }))).status, 400);
  assert.equal((await POST(req({ sessao_id: "x", contexto: "quadro", tipo: "transcricao_uso", dados: transcricao("quadro") }))).status, 404);
  assert.equal((await POST(new Request("http://localhost/api/uso", { method: "POST", body: "x".repeat(12_001) }))).status, 400);
});
