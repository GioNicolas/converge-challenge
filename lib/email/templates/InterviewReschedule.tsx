import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailTypography, palette } from "@/lib/email/templates/layout";
import { formatDateTime } from "@/lib/email/format";
import type { InterviewReschedulePayload } from "@/lib/email/types";

export function InterviewRescheduleEmail(props: InterviewReschedulePayload) {
  const when = formatDateTime(props.scheduledAt);
  return (
    <EmailLayout
      eyebrow="Entrevista remarcada"
      previewText={`Novo horário da sua entrevista para ${props.roleTitle}: ${when}`}
    >
      <Heading as="h2" style={emailTypography.heading}>
        Novo horário, {props.candidateName.split(" ")[0]}
      </Heading>
      {props.previousScheduledAt && (
        <Text style={emailTypography.muted}>
          O horário anterior ({formatDateTime(props.previousScheduledAt)}) não vale mais.
        </Text>
      )}
      <Text style={emailTypography.body}>
        Sua entrevista para <strong>{props.roleTitle}</strong> foi remarcada para{" "}
        <strong>{when}</strong> ({props.durationMin} min).
      </Text>
      {props.reason && (
        <Text style={{ ...emailTypography.muted, color: palette.accentDark }}>Motivo: {props.reason}</Text>
      )}
      <Section style={{ textAlign: "center", margin: "28px 0" }}>
        <Button href={props.joinUrl} style={emailTypography.button}>
          Entrar na entrevista
        </Button>
      </Section>
      <Text style={emailTypography.muted}>Se esse novo horário também não funcionar, é só responder este email.</Text>
    </EmailLayout>
  );
}
