import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { EmailDeliveryError, sendEmail, type EmailClient } from "@/lib/email/send";

const SECRET_HTML = "CONTEUDO-PII-Maria-Silva";
const template = createElement("p", null, SECRET_HTML);
const args = { to: "maria@exemplo.com", subject: "Assunto", template, templateName: "teste" };

const env = process.env as Record<string, string | undefined>;
const saved = { key: env.RESEND_API_KEY, node: env.NODE_ENV };

type SendResult = Awaited<ReturnType<EmailClient["emails"]["send"]>>;

function fakeClient(result: SendResult) {
  const send = mock.fn(async (_p: Parameters<EmailClient["emails"]["send"]>[0]) => result);
  return { client: { emails: { send } } as EmailClient, send };
}

function captureLogs() {
  const lines: string[] = [];
  const grab = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  mock.method(console, "warn", grab);
  mock.method(console, "error", grab);
  mock.method(console, "log", grab);
  return lines;
}

describe("sendEmail", () => {
  beforeEach(() => {
    delete env.RESEND_API_KEY;
    env.NODE_ENV = "test";
  });
  afterEach(() => {
    mock.restoreAll();
    if (saved.key === undefined) delete env.RESEND_API_KEY;
    else env.RESEND_API_KEY = saved.key;
    if (saved.node === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = saved.node;
  });

  it("simula sem RESEND_API_KEY fora de produção, sem chamar o cliente", async () => {
    const logs = captureLogs();
    const { client, send } = fakeClient({ data: { id: "1" }, error: null });
    const res = await sendEmail(args, client);
    assert.equal(res.status, "simulated");
    assert.equal(send.mock.callCount(), 0);
    assert.ok(logs.length > 0);
  });

  it("em produção sem chave lança EmailDeliveryError (não simula)", async () => {
    env.NODE_ENV = "production";
    captureLogs();
    await assert.rejects(sendEmail(args), (e) => e instanceof EmailDeliveryError);
  });

  it("envia html e text quando há chave", async () => {
    env.RESEND_API_KEY = "re_test";
    const { client, send } = fakeClient({ data: { id: "msg_1" }, error: null });
    const res = await sendEmail(args, client);
    assert.deepEqual(res, { status: "sent", id: "msg_1" });
    const payload = send.mock.calls[0].arguments[0];
    assert.equal(payload.to, args.to);
    assert.ok(payload.html.includes(SECRET_HTML));
    assert.ok(payload.text.includes(SECRET_HTML));
  });

  it("erro do provedor vira EmailDeliveryError", async () => {
    env.RESEND_API_KEY = "re_test";
    captureLogs();
    const { client } = fakeClient({ data: null, error: { message: "domínio inválido" } });
    await assert.rejects(
      sendEmail(args, client),
      (e: Error) => e instanceof EmailDeliveryError && e.message === "domínio inválido",
    );
  });

  it("logs não contêm HTML nem PII (nome, local-part do email)", async () => {
    const logs = captureLogs();
    await sendEmail(args); // simulado
    env.RESEND_API_KEY = "re_test";
    const { client } = fakeClient({ data: null, error: { message: "falhou" } });
    await assert.rejects(sendEmail(args, client));
    assert.ok(logs.length >= 2);
    for (const l of logs) {
      assert.ok(!l.includes(SECRET_HTML), l);
      assert.ok(!l.includes("<p>"), l);
      assert.ok(!l.includes("maria@"), l);
      assert.ok(!l.includes("Assunto"), l);
    }
  });
});
