import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { featherless } from "./featherless";
import { completeJson } from "./index";
import { chatJsonVia, eImagemDataUrl } from "./openaiCompat";

const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
const schema = z.object({ texto: z.string() });
const ok = () => Response.json({ choices: [{ message: { content: '{"texto":"ok"}' }, finish_reason: "stop" }], usage: {} });

function comChaves(t: { after: (fn: () => void) => void }, chaves: Record<string, string | undefined>) {
  const antes = Object.fromEntries(Object.keys(chaves).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(chaves)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  t.after(() => {
    for (const [k, v] of Object.entries(antes)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  });
}

test("só aceita data URL de imagem em base64", () => {
  assert.equal(eImagemDataUrl(FOTO), true);
  assert.equal(eImagemDataUrl("https://x/y.jpg"), false);
  assert.equal(eImagemDataUrl("data:text/html;base64,PGI+"), false);
  assert.equal(eImagemDataUrl(null), false);
});

test("OpenRouter recebe a foto junto do texto; sem foto, a mensagem é só texto", async (t) => {
  comChaves(t, { OPENROUTER_API_KEY: "chave-ficticia", FEATHERLESS_API_KEY: undefined });
  const corpos: { messages: { role: string; content: unknown }[] }[] = [];
  t.mock.method(globalThis, "fetch", async (_u: unknown, o?: RequestInit) => {
    corpos.push(JSON.parse(String(o?.body)));
    return ok();
  });
  await completeJson({ role: "quadro", system: "S", user: "U", schema, imageDataUrl: FOTO });
  await completeJson({ role: "quadro", system: "S", user: "U", schema });
  assert.deepEqual(corpos[0].messages[1].content, [{ type: "text", text: "U" }, { type: "image_url", image_url: { url: FOTO } }]);
  assert.equal(corpos[1].messages[1].content, "U");
});

test("modelo que recusa a imagem (4xx): repete só com o texto", async (t) => {
  comChaves(t, { OPENROUTER_API_KEY: "chave-ficticia", FEATHERLESS_API_KEY: undefined });
  const corpos: { messages: { content: unknown }[] }[] = [];
  t.mock.method(globalThis, "fetch", async (_u: unknown, o?: RequestInit) => {
    corpos.push(JSON.parse(String(o?.body)));
    return corpos.length === 1 ? new Response('{"error":"no image input"}', { status: 404 }) : ok();
  });
  const r = await completeJson({ role: "quadro", system: "S", user: "U", schema, imageDataUrl: FOTO });
  assert.equal(r.data.texto, "ok");
  assert.equal(corpos.length, 2);
  assert.equal(corpos[1].messages[1].content, "U");
});

test("Featherless (só texto) nunca recebe a foto", async (t) => {
  comChaves(t, { FEATHERLESS_API_KEY: "chave-ficticia" });
  const corpos: { messages: { content: unknown }[] }[] = [];
  t.mock.method(globalThis, "fetch", async (_u: unknown, o?: RequestInit) => {
    corpos.push(JSON.parse(String(o?.body)));
    return ok();
  });
  await chatJsonVia(featherless, { model: "m", system: "S", user: "U", schema, maxTokens: 50, imageDataUrl: FOTO });
  assert.equal(corpos[0].messages[1].content, "U");
});
