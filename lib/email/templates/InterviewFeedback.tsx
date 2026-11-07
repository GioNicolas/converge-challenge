import { Heading, Text } from "@react-email/components";
import { EmailLayout, emailTypography } from "@/lib/email/templates/layout";
import { feedbackMessage, greeting } from "@/lib/email/format";
import type { InterviewFeedbackPayload } from "@/lib/email/types";

/** Email ao candidato: só mensagem padrão por recomendação, sem conteúdo interno. */
export function InterviewFeedbackEmail({ candidateName, roleTitle, recommendation }: InterviewFeedbackPayload) {
  return (
    <EmailLayout eyebrow="Feedback da entrevista" previewText={`Retorno sobre sua entrevista para ${roleTitle}`}>
      <Heading as="h2" style={emailTypography.heading}>
        {greeting("Oi", candidateName)}
      </Heading>
      <Text style={emailTypography.body}>
        Obrigado por participar da entrevista pra <strong>{roleTitle}</strong>. {feedbackMessage[recommendation]}
      </Text>
    </EmailLayout>
  );
}
