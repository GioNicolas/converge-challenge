import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailTypography } from "@/lib/email/templates/layout";
import { formatDateTime } from "@/lib/email/format";
import type { InterviewInvitePayload } from "@/lib/email/types";

export function InterviewInviteEmail(props: InterviewInvitePayload) {
  const when = formatDateTime(props.scheduledAt);
  return (
    <EmailLayout
      eyebrow="Entrevista confirmada"
      previewText={`Sua entrevista para ${props.roleTitle} está marcada para ${when}`}
    >
      <Heading as="h2" style={emailTypography.heading}>
        Tudo certo, {props.candidateName.split(" ")[0]}
      </Heading>
      <Text style={emailTypography.body}>
        Sua entrevista técnica para a vaga de <strong>{props.roleTitle}</strong> está marcada para{" "}
        <strong>{when}</strong> ({props.durationMin} min).
      </Text>
      <Text style={emailTypography.body}>No horário, acesse o link abaixo — não é preciso instalar nada.</Text>
      <Section style={{ textAlign: "center", margin: "28px 0" }}>
        <Button href={props.joinUrl} style={emailTypography.button}>
          Entrar na entrevista
        </Button>
      </Section>
      <Text style={emailTypography.muted}>Se precisar remarcar, é só responder este email.</Text>
    </EmailLayout>
  );
}
