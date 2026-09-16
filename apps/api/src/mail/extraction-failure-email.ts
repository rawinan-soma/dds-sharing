import { m } from "../paraglide/messages.js";

// One undifferentiated failure, nothing else (spec §7, §14.3): the
// Requester cannot act on "504 on code 214 of the group", and silent death
// is the worst outcome for this audience — the cause split stays in
// `job_failed`, operator-facing only. Wording lives in the copy catalogue
// (messages/en.json authored source per ADR 0010; messages/th.json its
// translation), never composed inline here.
const LOCALE = "th" as const;

export interface ExtractionFailureEmailInput {
  referenceNumber: string;
  telephone: string;
}

export interface ExtractionFailureEmail {
  subject: string;
  text: string;
}

export function buildExtractionFailureEmail(
  input: ExtractionFailureEmailInput,
): ExtractionFailureEmail {
  const options = { locale: LOCALE };
  const subject = m.requester_extraction_failure_email_subject(
    { referenceNumber: input.referenceNumber },
    options,
  );
  const text = [
    m.requester_extraction_failure_email_greeting(options),
    "",
    m.requester_extraction_failure_email_body(
      { referenceNumber: input.referenceNumber },
      options,
    ),
    "",
    m.requester_extraction_failure_email_contact(
      { telephone: input.telephone },
      options,
    ),
  ].join("\n");
  return { subject, text };
}
