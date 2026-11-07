import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout, emailTypography, palette } from "@/lib/email/templates/layout";
import { feedbackNextStepsLabel, feedbackOpening } from "@/lib/email/format";
import type { InterviewFeedbackPayload } from "@/lib/email/types";

export function InterviewFeedbackEmail({ candidateName, roleTitle, report }: InterviewFeedbackPayload) {
  const opening = feedbackOpening[report.recommendation] ?? report.summary;
  const nextStepsLabel = feedbackNextStepsLabel[report.recommendation] ?? "Próximos passos";

  return (
    <EmailLayout eyebrow="Feedback da entrevista" previewText={`Feedback da sua entrevista para ${roleTitle}`}>
      <Heading as="h2" style={emailTypography.heading}>
        Oi, {candidateName.split(" ")[0]}
      </Heading>
      <Text style={emailTypography.body}>
        Obrigado por participar da entrevista pra <strong>{roleTitle}</strong>. {opening}
      </Text>
      <Text style={emailTypography.body}>{report.summary}</Text>

      {report.strengths.length > 0 && (
        <Section style={{ marginTop: 20 }}>
          <Text style={emailTypography.label}>Pontos fortes</Text>
          {report.strengths.map((s, i) => (
            <Text key={i} style={emailTypography.listItem}>• {s}</Text>
          ))}
        </Section>
      )}

      {report.concerns.length > 0 && (
        <Section style={{ marginTop: 20 }}>
          <Text style={emailTypography.label}>Pontos de atenção</Text>
          {report.concerns.map((c, i) => (
            <Text key={i} style={emailTypography.listItem}>• {c}</Text>
          ))}
        </Section>
      )}

      {report.nextSteps.length > 0 && (
        <Section style={{ marginTop: 20 }}>
          <Text style={emailTypography.label}>{nextStepsLabel}</Text>
          {report.nextSteps.map((n, i) => (
            <Text key={i} style={emailTypography.listItem}>• {n}</Text>
          ))}
        </Section>
      )}

      <Text style={{ ...emailTypography.muted, marginTop: 24, color: palette.textMuted }}>
        Essa avaliação apoia a decisão do recrutador — a decisão final é sempre humana.
      </Text>
    </EmailLayout>
  );
}
