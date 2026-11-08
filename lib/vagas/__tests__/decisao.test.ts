import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "@/app/api/decisao/route";
import { decidir, lerDecisoes } from "@/lib/vagas/decisao";

process.env.ARMAZENAMENTO = "memoria";

test("a primeira decisão vale e aparece na leitura", async () => {
  const a = await decidir("sess-dec-1", "avancar");
  assert.equal(a.jaDecidida, false);
  assert.equal(a.registro.email, "sem_candidato");
  const b = await decidir("sess-dec-1", "nao_avancar");
  assert.equal(b.jaDecidida, true);
  assert.equal(b.registro.decisao, "avancar");
  assert.equal((await lerDecisoes()).get("sess-dec-1")?.decisao, "avancar");
});

test("rota valida o corpo", async () => {
  const ruim = await POST(new Request("http://x/api/decisao", { method: "POST", body: JSON.stringify({ sessionId: "../x", decisao: "talvez" }) }));
  assert.equal(ruim.status, 400);
  const ok = await POST(new Request("http://x/api/decisao", { method: "POST", body: JSON.stringify({ sessionId: "sess-dec-2", decisao: "nao_avancar" }) }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).decisao, "nao_avancar");
});
