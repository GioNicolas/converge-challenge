import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { render } from "@react-email/render";
import { InterviewInviteEmail } from "@/lib/email/templates/InterviewInvite";
import { InterviewRescheduleEmail } from "@/lib/email/templates/InterviewReschedule";
import { InterviewFeedbackEmail } from "@/lib/email/templates/InterviewFeedback";
import { TriagemConviteEmail } from "@/lib/email/templates/TriagemConvite";

// O tsx compila JSX no modo clássico, que espera React global.
Object.assign(globalThis, { React });

const candidato = { candidateName: "Maria Silva", to: "maria@exemplo.com", roleTitle: "Engenheira de Software" };
const quando = "2026-11-09T14:00:00-03:00";
const link = "https://exemplo.com/sala";

const templates: [string, React.ReactElement, boolean][] = [
  [
    "triagem",
    React.createElement(TriagemConviteEmail, {
      ...candidato,
      mode: "live_coding",
      durationMin: 30,
      languages: ["python"],
      scheduleUrl: link,
    }),
    true,
  ],
  ["convite", React.createElement(InterviewInviteEmail, { ...candidato, scheduledAt: quando, durationMin: 30, joinUrl: link }), true],
  [
    "remarcação",
    React.createElement(InterviewRescheduleEmail, {
      ...candidato,
      scheduledAt: quando,
      previousScheduledAt: "2026-11-08T14:00:00-03:00",
      durationMin: 30,
      joinUrl: link,
      reason: "conflito de agenda",
    }),
    true,
  ],
  ["feedback", React.createElement(InterviewFeedbackEmail, { ...candidato, recommendation: "avancar" }), false],
];

describe("templates seguem a paleta do site", () => {
  for (const [nome, el, temBotao] of templates) {
    it(`${nome}: off-white, tinta preta, sem azul e sem imagem`, async () => {
      const html = (await render(el)).toLowerCase();
      assert.match(html, /background-color:#f4f1ea/, "fundo off-white");
      assert.match(html, /background-color:#fdfcf9/, "cartão");
      assert.doesNotMatch(html, /#0071e3|#0058b0/, "sem o azul antigo");
      assert.doesNotMatch(html, /<img/, "sem imagens");
      if (temBotao) {
        assert.match(html, /background-color:#111111[^"]*color:#f4f1ea/, "botão preto com texto off-white");
        // Um link só: o do botão (menos cara de newsletter).
        assert.equal(html.match(/<a /g)?.length, 1);
      }
    });

    it(`${nome}: tem versão texto puro com a assinatura do time`, async () => {
      const texto = await render(el, { plainText: true });
      assert.match(texto, /Time de Recrutamento/);
      assert.doesNotMatch(texto, /<[a-z]/i);
      if (temBotao) assert.ok(texto.includes(link), "o link aparece no texto puro");
    });
  }
});

describe("texto puro enviado", () => {
  it("não grita o título em caixa alta", async () => {
    const { sendEmail } = await import("@/lib/email/send");
    const env = process.env as Record<string, string | undefined>;
    const antes = env.RESEND_API_KEY;
    env.RESEND_API_KEY = "re_test";
    let texto = "";
    try {
      await sendEmail(
        { to: "maria@exemplo.com", subject: "x", template: templates[0][1] },
        {
          emails: {
            async send(p) {
              texto = p.text;
              return { data: { id: "1" }, error: null };
            },
          },
        },
      );
    } finally {
      if (antes === undefined) delete env.RESEND_API_KEY;
      else env.RESEND_API_KEY = antes;
    }
    assert.match(texto, /Boa notícia, Maria/);
    assert.doesNotMatch(texto, /BOA NOTÍCIA/);
  });
});
