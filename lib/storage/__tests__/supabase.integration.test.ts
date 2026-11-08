// Teste de integração com o Supabase de VERDADE. Só roda por `npm run test:supabase` (que carrega o .env):
// grava e apaga linhas e arquivos de teste, todos com um prefixo próprio, no projeto configurado.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { criarRepositorioKv } from "@/lib/agente/armazenamento/kv";
import { criarRepositorioAvaliacoesKv } from "@/lib/agente/kits/repositorio-kv";
import { estadoInicial } from "@/lib/agente/sessao/estado";
import { KIT_SYSTEM_DESIGN } from "@/lib/agente/kits/system-design";
import { criarArquivosSupabase, type ArmazenamentoDeArquivos } from "../arquivos";
import { criarKvSupabase, supabaseConfigurado, type Kv } from "../kv";

const habilitado = process.env.npm_lifecycle_event === "test:supabase";
const cfg = supabaseConfigurado();

describe("Supabase de verdade", { skip: !habilitado || !cfg }, () => {
  const prefixo = `teste-${randomUUID().slice(0, 8)}`;
  const gravados = new Set<string>();
  let kv: Kv;
  let arquivos: ArmazenamentoDeArquivos;
  const caminhos: string[] = [];

  before(() => {
    const real = criarKvSupabase(cfg!);
    // Isola tudo sob um prefixo e lembra o que gravou, para apagar no fim.
    kv = {
      nome: "supabase",
      get: (ns, k) => real.get(`${prefixo}:${ns}`, k),
      set: (ns, k, v) => (gravados.add(`${prefixo}:${ns}\u0000${k}`), real.set(`${prefixo}:${ns}`, k, v)),
      setIfAbsent: (ns, k, v) => (gravados.add(`${prefixo}:${ns}\u0000${k}`), real.setIfAbsent(`${prefixo}:${ns}`, k, v)),
      list: (ns) => real.list(`${prefixo}:${ns}`),
      delete: (ns, k) => real.delete(`${prefixo}:${ns}`, k),
    };
    const realArq = criarArquivosSupabase(cfg!);
    arquivos = {
      nome: "supabase",
      salvar: (c, b, t) => (caminhos.push(`${prefixo}/${c}`), realArq.salvar(`${prefixo}/${c}`, b, t)),
      obter: (c) => realArq.obter(`${prefixo}/${c}`),
    };
  });

  after(async () => {
    const real = criarKvSupabase(cfg!);
    for (const g of gravados) {
      const [ns, k] = g.split("\u0000");
      await real.delete(ns, k).catch(() => {});
    }
    for (const c of caminhos) {
      await fetch(`${cfg!.url.replace(/\/+$/, "")}/storage/v1/object/desenhos/${c}`, {
        method: "DELETE",
        headers: { apikey: cfg!.chave, Authorization: `Bearer ${cfg!.chave}` },
      }).catch(() => {});
    }
  });

  it("kv: set, get, setIfAbsent, list e delete", async () => {
    await kv.set("basico", "a", { n: 1, texto: "ação com acento e | barra" });
    assert.deepEqual(await kv.get("basico", "a"), { n: 1, texto: "ação com acento e | barra" });
    assert.equal(await kv.get("basico", "nao-existe"), null);
    assert.equal(await kv.setIfAbsent("basico", "b", 1), true);
    assert.equal(await kv.setIfAbsent("basico", "b", 2), false);
    assert.equal(await kv.get("basico", "b"), 1);
    const lista = await kv.list("basico");
    assert.deepEqual(lista.map((r) => r.key).sort(), ["a", "b"]);
    await kv.delete("basico", "a");
    assert.equal(await kv.get("basico", "a"), null);
  });

  it("repositório de sessões: ciclo completo, com eventos idempotentes e imagem no Storage", async () => {
    const r = criarRepositorioKv(kv, arquivos);
    const s = await r.criar({ avaliacaoId: "demo", candidatoId: "teste", estado: estadoInicial() });
    assert.equal((await r.obter(s.id))!.estado.fase, "AGUARDANDO");
    assert.equal(await r.contarAnalise(s.id), 1);
    await r.salvarEstado(s.id, { ...s.estado, fase: "REQUISITOS" });
    const lido = (await r.obter(s.id))!;
    assert.equal(lido.estado.fase, "REQUISITOS");
    assert.equal(lido.analises, 1);

    const e = (n: number) => ({ horario: "2026-11-07T15:00:00.120Z", tipo: "fala", dados: { n } });
    assert.equal((await r.anexarEventos(s.id, [e(1), e(2), e(2)])).length, 2);
    assert.equal((await r.anexarEventos(s.id, [e(2), e(3)])).length, 1);
    assert.deepEqual((await r.listarEventos(s.id)).map((x) => (x.dados as { n: number }).n), [1, 2, 3]);

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    assert.equal(await r.salvarImagem(s.id, { bytes: png, horario: "h1" }), 1);
    const volta = await r.obterImagem(s.id, 1);
    assert.deepEqual(volta?.bytes, png);
    assert.deepEqual(await r.listarImagens(s.id), [{ numero: 1, horario: "h1" }]);

    await r.salvarScorecard(s.id, { teste: true } as never);
    assert.deepEqual(await r.obterScorecard(s.id), { teste: true });
  });

  it("avaliações geradas: criar, aprovar e substituir tira a aprovação", async () => {
    const r = criarRepositorioAvaliacoesKv(kv);
    const problema = KIT_SYSTEM_DESIGN.problemas[0];
    const avaliacaoId = `${prefixo}-av`;
    const criada = await r.criar({ avaliacaoId, kit: KIT_SYSTEM_DESIGN, problema, vagaId: "v" });
    assert.equal(criada.aprovado, false);
    assert.equal((await r.aprovar(avaliacaoId))!.aprovado, true);
    assert.equal((await r.obter(avaliacaoId))!.aprovado, true);
    assert.equal((await r.substituirKit(avaliacaoId, KIT_SYSTEM_DESIGN, problema))!.aprovado, false);
    assert.equal(await r.obter(`${prefixo}-nao-existe`), undefined);
  });
});
