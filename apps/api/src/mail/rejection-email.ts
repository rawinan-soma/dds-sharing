import { m } from "../paraglide/messages.js";

// Says it was not approved and says nothing else (spec §10.3, design handoff
// screen 5b): no reason, no reviewer's name. The wording is a decision and
// lives in the copy catalogue (messages/en.json, authored source per ADR
// 0010; messages/th.json its translation), compiled by Paraglide — never
// composed inline here. Thai is what actually reaches a Requester; there is
// no locale-selection concept elsewhere in this application yet.
const LOCALE = "th" as const;

export interface RejectionEmailInput {
  referenceNumber: string;
  telephone: string;
}

export interface RejectionEmail {
  subject: string;
  text: string;
}

export function buildRejectionEmail(input: RejectionEmailInput): RejectionEmail {
  const options = { locale: LOCALE };
  const subject = m.requester_rejection_email_subject({ referenceNumber: input.referenceNumber }, options);
  const text = [
    m.requester_rejection_email_greeting(options),
    "",
    m.requester_rejection_email_body({ referenceNumber: input.referenceNumber }, options),
    "",
    m.requester_rejection_email_contact({ telephone: input.telephone }, options),
  ].join("\n");
  return { subject, text };
}
