import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  candidatosPorSessao,
  criarConvite,
  linkDaEntrevista,
  listarConvites,
  novoEntrevistaId,
  salvarConvite,
  vincularSessao,
} from "@/lib/convites/store";

// O store grava em <cwd>/data/convites: roda numa pasta temporária pra não sujar o projeto.
const cwdOriginal = process.cwd();
let pasta = "";
before(async () => {
  pasta = await mkdtemp(join(tmpdir(), "convites-"));
  process.chdir(pasta);
});
after(async () => {
  process.chdir(cwdOriginal);
  await rm(pasta, { recursive: true, force: true });
});

const novo = (nome: string) =>
  criarConvite({
    vagaId: "v1",
    configId: "cfg 1",
    cargo: "Dev",
    mode: "live_coding",
    durationMin: 30,
    languages: ["python"],
    candidato: { nome, email: `${nome.toLowerCase()}@exemplo.com` },
  });

describe("vínculo convite → sessão de entrevista", () => {
  it("o link da entrevista leva a vaga e o id do convite (não o token)", () => {
    const c = { ...novo("Ana"), entrevistaId: "0123456789abcdef" };
    assert.equal(linkDaEntrevista("https://x.app/", c), "https://x.app/?config=cfg%201&convite=0123456789abcdef");
    assert.equal(linkDaEntrevista("https://x.app", { configId: "c" }), "https://x.app/?config=c");
    assert.ok(!linkDaEntrevista("https://x.app", c).includes(c.token));
  });

  it("vincula a sessão ao convite certo e o painel acha o nome", async () => {
    const ana = { ...novo("Ana"), status: "agendado" as const, entrevistaId: novoEntrevistaId() };
    const bia = { ...novo("Bia"), status: "agendado" as const, entrevistaId: novoEntrevistaId() };
    await salvarConvite(ana);
    await salvarConvite(bia);

    assert.equal(await vincularSessao(ana.entrevistaId, "sessao-1"), true);
    assert.equal(await vincularSessao(ana.entrevistaId, "sessao-1"), true); // repetido não duplica
    assert.equal(await vincularSessao(bia.entrevistaId, "sessao-2"), true);

    const nomes = await candidatosPorSessao();
    assert.equal(nomes.get("sessao-1"), "Ana");
    assert.equal(nomes.get("sessao-2"), "Bia");
    const salvaAna = (await listarConvites()).find((c) => c.token === ana.token);
    assert.deepEqual(salvaAna?.sessoes, ["sessao-1"]);
  });

  it("recusa id desconhecido ou malformado e sessionId estranho", async () => {
    assert.equal(await vincularSessao("ffffffffffffffff", "s"), false);
    assert.equal(await vincularSessao("../../etc", "s"), false);
    const c = { ...novo("Caio"), entrevistaId: novoEntrevistaId() };
    await salvarConvite(c);
    assert.equal(await vincularSessao(c.entrevistaId, "../x"), false);
  });
});
