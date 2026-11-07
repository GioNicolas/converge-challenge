import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { z } from "zod";
import { handleEmailRoute } from "@/lib/email/api";
import { EmailDeliveryError } from "@/lib/email/send";

const SECRET = "segredo-de-teste";
let ipCounter = 0;
const uniqueIp = () => `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

function makeReq(opts: { key?: string | null; ip?: string; body?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (opts.key !== null) headers["x-api-key"] = opts.key ?? SECRET;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  return new NextRequest("http://localhost/api/email/test", {
    method: "POST",
    headers,
    body: opts.body ?? JSON.stringify({ a: 1 }),
  });
}

const ok = async () => ({ status: "sent", id: "abc" }) as const;

describe("handleEmailRoute", () => {
  const original = process.env.EMAIL_API_SECRET;
  beforeEach(() => {
    process.env.EMAIL_API_SECRET = SECRET;
    mock.method(console, "error", () => {});
  });
  afterEach(() => {
    mock.restoreAll();
    if (original === undefined) delete process.env.EMAIL_API_SECRET;
    else process.env.EMAIL_API_SECRET = original;
  });

  it("401 quando EMAIL_API_SECRET não está configurado (fail closed)", async () => {
    delete process.env.EMAIL_API_SECRET;
    const res = await handleEmailRoute(makeReq({ ip: uniqueIp() }), ok, "t");
    assert.equal(res.status, 401);
  });

  it("401 sem x-api-key", async () => {
    const res = await handleEmailRoute(makeReq({ key: null, ip: uniqueIp() }), ok, "t");
    assert.equal(res.status, 401);
  });

  it("401 com x-api-key errada (mesmo tamanho e tamanho diferente)", async () => {
    const same = "x".repeat(SECRET.length);
    assert.equal((await handleEmailRoute(makeReq({ key: same, ip: uniqueIp() }), ok, "t")).status, 401);
    assert.equal((await handleEmailRoute(makeReq({ key: "curta", ip: uniqueIp() }), ok, "t")).status, 401);
  });

  it("429 após 20 requisições do mesmo IP na janela", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 20; i++) {
      assert.equal((await handleEmailRoute(makeReq({ ip }), ok, "t")).status, 200, `req ${i + 1}`);
    }
    assert.equal((await handleEmailRoute(makeReq({ ip }), ok, "t")).status, 429);
    // outro IP não é afetado
    assert.equal((await handleEmailRoute(makeReq({ ip: uniqueIp() }), ok, "t")).status, 200);
  });

  it("prefere x-real-ip ao x-forwarded-for forjável", async () => {
    const real = uniqueIp();
    for (let i = 0; i < 20; i++) {
      // x-forwarded-for muda a cada request, x-real-ip é fixo
      await handleEmailRoute(makeReq({ ip: uniqueIp(), headers: { "x-real-ip": real } }), ok, "t");
    }
    const res = await handleEmailRoute(makeReq({ ip: uniqueIp(), headers: { "x-real-ip": real } }), ok, "t");
    assert.equal(res.status, 429);
  });

  it("requisições não autorizadas não consomem o limite", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 25; i++) await handleEmailRoute(makeReq({ key: "errada", ip }), ok, "t");
    assert.equal((await handleEmailRoute(makeReq({ ip }), ok, "t")).status, 200);
  });

  it("400 para JSON malformado", async () => {
    const res = await handleEmailRoute(makeReq({ body: "{nao-json", ip: uniqueIp() }), ok, "t");
    assert.equal(res.status, 400);
  });

  it("400 em ZodError", async () => {
    const send = async () => {
      z.object({ x: z.string() }).parse({});
      return { status: "sent", id: "1" } as const;
    };
    const res = await handleEmailRoute(makeReq({ ip: uniqueIp() }), send, "t");
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error);
  });

  it("502 em EmailDeliveryError sem vazar a causa", async () => {
    const send = async () => {
      throw new EmailDeliveryError("detalhe interno");
    };
    const res = await handleEmailRoute(makeReq({ ip: uniqueIp() }), send, "convite");
    assert.equal(res.status, 502);
    const text = JSON.stringify(await res.json());
    assert.ok(!text.includes("detalhe interno"));
  });

  it("500 em erro inesperado", async () => {
    const send = async () => {
      throw new Error("boom");
    };
    const res = await handleEmailRoute(makeReq({ ip: uniqueIp() }), send, "t");
    assert.equal(res.status, 500);
  });

  it("200 repassa o resultado e o corpo ao send", async () => {
    let received: unknown;
    const send = async (input: unknown) => {
      received = input;
      return { status: "sent", id: "xyz" } as const;
    };
    const res = await handleEmailRoute(makeReq({ ip: uniqueIp(), body: '{"k":"v"}' }), send, "t");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "sent", id: "xyz" });
    assert.deepEqual(received, { k: "v" });
  });
});
