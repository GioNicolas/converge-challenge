import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

/** Paleta estilo Apple: neutros, muito espaço em branco, um único acento azul. */
export const palette = {
  ink: "#1D1D1F",
  textMuted: "#6E6E73",
  background: "#FFFFFF",
  surface: "#F5F5F7",
  border: "#D2D2D7",
  accent: "#0071E3",
  accentDark: "#0058B0",
};

const fontStack =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const styles = {
  body: { backgroundColor: palette.surface, fontFamily: fontStack, padding: "48px 0" },
  container: {
    backgroundColor: palette.background,
    borderRadius: 18,
    padding: "44px 40px",
    maxWidth: 480,
    margin: "0 auto",
  },
  eyebrow: {
    fontFamily: fontStack,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: palette.accent,
    margin: "0 0 8px",
  },
  footer: { color: palette.textMuted, fontSize: 12, lineHeight: "18px", marginTop: 4, fontFamily: fontStack },
  hr: { borderColor: palette.border, margin: "32px 0 24px" },
};

export function EmailLayout({
  previewText,
  eyebrow,
  children,
}: {
  previewText: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          {children}
          <Hr style={styles.hr} />
          <Section>
            <Text style={styles.footer}>
              Converge Challenge — entrevistador técnico com IA. Dados usados nesta demo são sintéticos.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailTypography = {
  heading: {
    fontFamily: fontStack,
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: "-0.015em",
    lineHeight: "34px",
    color: palette.ink,
    margin: "0 0 20px",
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
    backgroundColor: palette.accent,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: 600,
    padding: "13px 26px",
    borderRadius: 12,
  },
};
