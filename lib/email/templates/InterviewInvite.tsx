import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailTypography } from "@/lib/email/templates/layout";
import { formatDateTime, greeting } from "@/lib/email/format";
import type { InterviewInvitePayload } from "@/lib/email/types";

export function InterviewInviteEmail(props: InterviewInvitePayload) {
  const when = formatDateTime(props.scheduledAt);
  return (
    <EmailLayout
      eyebrow="Entrevista confirmada"
      previewText={`Sua entrevista para ${props.roleTitle} está marcada para ${when}`}
    >
      <Heading as="h2" style={emailTypography.heading}>
        {greeting("Tudo certo", props.candidateName)}
      </Heading>
      <Text style={emailTypography.body}>
        Sua entrevista técnica para a vaga de <strong>{props.roleTitle}</strong> está marcada para{" "}
        <strong>{when}</strong> ({props.durationMin} min).
      </Text>
      <Text style={emailTypography.body}>No horário, acesse o link abaixo — não é preciso instalar nada.</Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={props.joinUrl} style={emailTypography.button}>
          Entrar na entrevista
        </Button>
      </Section>
      <Text style={emailTypography.muted}>
        {process.env.EMAIL_REPLY_TO
          ? "Se precisar remarcar, é só responder este email."
          : "Se precisar remarcar, entre em contato com o time responsável pelo processo seletivo."}
      </Text>
    </EmailLayout>
  );
}
