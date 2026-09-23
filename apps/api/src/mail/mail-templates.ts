import { type Catalogue } from '../i18n/copy-catalogue';

export interface RenderedMail {
  subject: string;
  html: string;
}

export interface DeliveryParams {
  kind: 'delivery';
  name: string;
  reference: string;
  downloadUrl: string;
}

export interface RejectionParams {
  kind: 'rejection';
  name: string;
  reference: string;
}

export interface ExtractionFailureParams {
  kind: 'extraction_failure';
  name: string;
  reference: string;
}

export interface QueueNotificationParams {
  kind: 'queue_notification';
  reference: string;
  requesterName: string;
  workplace: string;
  /** Pre-formatted — this module does no date/timezone rendering. */
  deadline: string;
  queueUrl: string;
}

export type MailParams =
  | DeliveryParams
  | RejectionParams
  | ExtractionFailureParams
  | QueueNotificationParams;

// Table-based layout, every style inline, no external assets or CSS — the
// usual constraints for Gmail/Outlook (AC: this ticket's templates, the
// actual client rendering is a manual pass the ticket calls out separately).
const FONT =
  'font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 15px; line-height: 1.5;';

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 20px 0;"><tr><td style="background-color: #0b5fff; border-radius: 4px;"><a href="${href}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: bold; ${FONT}">${label}</a></td></tr></table>`;
}

function wrap(t: Catalogue['t'], body: string): string {
  return `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background-color: #f4f4f4;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; max-width: 600px; width: 100%;">
            <tr><td style="padding: 24px; ${FONT}">
              <p style="margin: 0 0 16px; font-weight: bold;">${t('app_service_name')}</p>
              ${body}
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
              <p style="margin: 0; font-size: 13px; color: #666666;">${t('app_department')}<br>${t('app_telephone')}</p>
            </td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin: 0 0 16px;">${text}</p>`;
}

// `name`/`requesterName`/`workplace` are free text a Requester typed into the
// public, unauthenticated form (spec §4.1, CONTEXT.md's Workplace: "never
// validated") — the queue notification in particular carries it straight into
// a Reviewer's inbox, so it is escaped before it ever reaches an HTML
// template, exactly like any other untrusted input rendered as HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDelivery(t: Catalogue['t'], p: DeliveryParams): RenderedMail {
  return {
    subject: t('email_delivery_subject', { reference: p.reference }),
    html: wrap(
      t,
      [
        paragraph(t('email_greeting', { name: escapeHtml(p.name) })),
        paragraph(t('email_delivery_body', { reference: p.reference })),
        button(p.downloadUrl, t('email_delivery_download')),
        paragraph(t('email_delivery_expiry_note')),
        paragraph(t('email_delivery_zip_note')),
      ].join(''),
    ),
  };
}

function renderRejection(t: Catalogue['t'], p: RejectionParams): RenderedMail {
  return {
    subject: t('email_rejection_subject', { reference: p.reference }),
    html: wrap(
      t,
      [
        paragraph(t('email_greeting', { name: escapeHtml(p.name) })),
        paragraph(t('email_rejection_outcome', { reference: p.reference })),
        paragraph(t('email_rejection_no_reason')),
        paragraph(
          t('email_rejection_contact', { telephone: t('app_telephone') }),
        ),
      ].join(''),
    ),
  };
}

function renderExtractionFailure(
  t: Catalogue['t'],
  p: ExtractionFailureParams,
): RenderedMail {
  return {
    subject: t('email_failure_subject', { reference: p.reference }),
    html: wrap(
      t,
      [
        paragraph(t('email_greeting', { name: escapeHtml(p.name) })),
        paragraph(t('email_failure_body', { reference: p.reference })),
        paragraph(
          `<strong>${t('email_failure_not_your_job_heading')}</strong>`,
        ),
        paragraph(t('email_failure_not_your_job_detail')),
        paragraph(t('email_failure_requester_unaware')),
        paragraph(t('email_failure_action_note')),
      ].join(''),
    ),
  };
}

function renderQueueNotification(
  t: Catalogue['t'],
  p: QueueNotificationParams,
): RenderedMail {
  return {
    subject: t('email_queue_subject', { reference: p.reference }),
    html: wrap(
      t,
      [
        paragraph(t('email_queue_lead')),
        paragraph(
          `${t('email_queue_requester')}: ${escapeHtml(p.requesterName)}`,
        ),
        paragraph(`${t('email_queue_workplace')}: ${escapeHtml(p.workplace)}`),
        paragraph(`${t('email_queue_deadline')}: ${p.deadline}`),
        button(p.queueUrl, t('email_queue_open')),
        paragraph(t('email_queue_no_data_note')),
        paragraph(t('email_queue_notification_note')),
      ].join(''),
    ),
  };
}

export function renderMail(
  catalogueInstance: Catalogue,
  params: MailParams,
): RenderedMail {
  const t = catalogueInstance.t.bind(catalogueInstance);
  switch (params.kind) {
    case 'delivery':
      return renderDelivery(t, params);
    case 'rejection':
      return renderRejection(t, params);
    case 'extraction_failure':
      return renderExtractionFailure(t, params);
    case 'queue_notification':
      return renderQueueNotification(t, params);
  }
}
