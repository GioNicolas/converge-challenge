import { Body, Container, Head, Html, Preview, Text } from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Paleta do site (app/tema-recrutador.css): papel off-white e tinta preta, sem cor de destaque.
 * Bordas em hex sólido (e não rgba) porque o Outlook ignora transparência em borda.
 */
export const palette = {
  ink: "#111111",
  textMuted: "#6b675f",
  /** Fundo do e-mail (= --fundo do site). */
  background: "#f4f1ea",
  /** Cartão (= --superficie). */
  surface: "#fdfcf9",
  /** Blocos internos (= --superficie-2). */
  surface2: "#ece8df",
  /** ≈ rgb(17 17 17 / 0.1) sobre o off-white. */
  border: "#dedad2",
  /** Texto sobre o botão preto (= --texto-claro). */
  onInk: "#f4f1ea",
};

const fontStack =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const styles = {
  body: { backgroundColor: palette.background, fontFamily: fontStack, margin: 0, padding: "32px 12px" },
  container: {
    backgroundColor: palette.surface,
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    padding: "36px 32px",
    maxWidth: 480,
    margin: "0 auto",
  },
  eyebrow: {
    fontFamily: fontStack,
    fontSize: 12,
    fontWeight: 500,
    color: palette.textMuted,
    margin: "0 0 10px",
  },
  signature: { fontFamily: fontStack, fontSize: 15, lineHeight: "23px", color: palette.ink, margin: "28px 0 0" },
  footer: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: "18px",
    margin: "20px auto 0",
    maxWidth: 480,
    padding: "0 4px",
    fontFamily: fontStack,
  },
};

/**
 * Casca comum: um cartão só, sem imagem, sem logo e sem rodapé de newsletter. E-mail transacional
 * com cara de mensagem pessoal (assinatura do time, um botão) tende a ir pra Principal, não Promoções.
 */
export function EmailLayout({
  previewText,
  eyebrow,
  children,
  simples = false,
  signature = "Time de Recrutamento",
}: {
  previewText?: string;
  eyebrow?: string;
  simples?: boolean;
  signature?: string;
  children: ReactNode;
}) {
  if (simples) {
    return (
      <Html lang="pt-BR">
        <Head />
        <Body style={{ fontFamily: fontStack, color: palette.ink, margin: 0, padding: "24px 16px" }}>
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            {children}
            <Text style={styles.signature}>{signature}</Text>
          </div>
        </Body>
      </Html>
    );
  }
  const podeResponder = Boolean(process.env.EMAIL_REPLY_TO);
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{previewText ?? ""}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>{eyebrow ?? ""}</Text>
          {children}
          <Text style={styles.signature}>{signature}</Text>
        </Container>
        <Text style={styles.footer}>
          Você recebeu esta mensagem porque se candidatou a uma vaga
          {podeResponder ? ". Dúvidas? É só responder." : "."}
        </Text>
      </Body>
    </Html>
  );
}

export const emailTypography = {
  heading: {
    fontFamily: fontStack,
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    lineHeight: "30px",
    color: palette.ink,
    margin: "0 0 18px",
  },
  body: { fontFamily: fontStack, fontSize: 15, lineHeight: "23px", color: palette.ink, margin: "0 0 16px" },
  muted: { fontFamily: fontStack, fontSize: 14, lineHeight: "21px", color: palette.textMuted, margin: "0 0 16px" },
  label: {
    fontFamily: fontStack,
    fontSize: 13,
    fontWeight: 600,
    color: palette.ink,
    margin: "0 0 6px",
  },
  listItem: { fontFamily: fontStack, fontSize: 14, lineHeight: "21px", color: palette.ink, margin: "0 0 4px" },
  button: {
    fontFamily: fontStack,
    backgroundColor: palette.ink,
    color: palette.onInk,
    fontSize: 15,
    fontWeight: 600,
    padding: "13px 24px",
    borderRadius: 6,
  },
};
