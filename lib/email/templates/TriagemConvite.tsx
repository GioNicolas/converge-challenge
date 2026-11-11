import { Button, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailTypography } from "@/lib/email/templates/layout";
import { greeting, nomeLinguagens } from "@/lib/email/format";
import type { TriagemConvitePayload } from "@/lib/email/types";

/** Só diz o formato: problema, critérios e foco ficam de fora de propósito. */
export function TriagemConviteEmail(props: TriagemConvitePayload & { recruiterName?: string }) {
  const linguagens = nomeLinguagens(props.languages);
  const assinatura = props.recruiterName?.trim() || "Totti";
  return (
    <EmailLayout simples signature={assinatura}>
      <Text style={emailTypography.body}>{greeting("Oi", props.candidateName)},</Text>
      <Text style={emailTypography.body}>
        Você passou para a triagem técnica da vaga de <strong>{props.roleTitle}</strong>. O próximo passo é uma
        entrevista técnica de <strong>{props.durationMin} minutos</strong>, feita no navegador.
      </Text>
      {props.mode === "live_coding" ? (
        <Text style={emailTypography.body}>
          Você vai resolver um problema de programação num editor, na linguagem que preferir
          {linguagens ? ` (${linguagens})` : ""}, conversando com o entrevistador sobre o seu raciocínio.
        </Text>
      ) : (
        <Text style={emailTypography.body}>
          Você vai desenhar a arquitetura de um sistema num quadro e conversar com o entrevistador sobre as suas
          escolhas.
        </Text>
      )}
      <Text style={emailTypography.body}>Não precisa instalar nada. Escolha o horário que for melhor para você:</Text>
      <Text style={emailTypography.body}>
        <Link href={props.scheduleUrl}>{props.scheduleUrl}</Link>
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={props.scheduleUrl} style={emailTypography.button}>
          Escolher meu horário
        </Button>
      </Section>
      <Text style={emailTypography.muted}>O link é pessoal e vale por 7 dias.</Text>
    </EmailLayout>
  );
}
