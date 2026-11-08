import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailTypography, palette } from "@/lib/email/templates/layout";
import { formatDateTime, greeting } from "@/lib/email/format";
import type { InterviewReschedulePayload } from "@/lib/email/types";

export function InterviewRescheduleEmail(props: InterviewReschedulePayload) {
  const when = formatDateTime(props.scheduledAt);
  return (
    <EmailLayout
      eyebrow="Entrevista remarcada"
      previewText={`Novo horário da sua entrevista para ${props.roleTitle}: ${when}`}
    >
      <Heading as="h2" style={emailTypography.heading}>
        {greeting("Novo horário", props.candidateName)}
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
        <Text style={{ ...emailTypography.body, color: palette.textMuted }}>Motivo: {props.reason}</Text>
      )}
      <Section style={{ margin: "24px 0" }}>
        <Button href={props.joinUrl} style={emailTypography.button}>
          Entrar na entrevista
        </Button>
      </Section>
      <Text style={emailTypography.muted}>
        {process.env.EMAIL_REPLY_TO
          ? "Se esse novo horário também não funcionar, é só responder este email."
          : "Se esse novo horário também não funcionar, entre em contato com o time responsável pelo processo seletivo."}
      </Text>
    </EmailLayout>
  );
}
