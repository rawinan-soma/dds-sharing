import { B } from '../design/b-tokens';
import { areaHeadline, formatDay } from '../i18n/ask-copy';
import { type Catalogue } from '../i18n/copy-catalogue';
import { type Ask } from '../requests/ask';

export interface RenderedMail {
  subject: string;
  html: string;
}

export interface DeliveryParams {
  kind: 'delivery';
  name: string;
  reference: string;
  downloadUrl: string;
  /** What was asked for, as stored. Never the row count (screen 9). */
  ask: Ask;
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
// usual constraints for Gmail/Outlook. The colours are B's tokens
// (src/design/b-tokens.ts), inlined as literals because an email cannot load
// the app's stylesheet; the screen-9 frames are the reference.
const FONT_FAMILY =
  "font-family: 'IBM Plex Sans Thai', 'IBM Plex Sans', Tahoma, Arial, sans-serif;";
const FONT = `${FONT_FAMILY} color: ${B.foreground}; font-size: 15px; line-height: 1.65;`;
const FIGURE = 'font-variant-numeric: tabular-nums;';
const TITLE = 'font-size: 16px; font-weight: 600; line-height: 1.35;';

/** Every figure is tabular (system.md "Type"): references, dates, phone numbers. */
function figure(text: string): string {
  return `<span style="${FIGURE}">${text}</span>`;
}

function strong(text: string): string {
  return `<strong style="font-weight: 600;">${text}</strong>`;
}

/** A layout table; `width` null lets it shrink to its content. */
function table(
  style: string,
  rows: string,
  width: string | null = '100%',
): string {
  const widthAttr = width === null ? '' : ` width="${width}"`;
  return `<table role="presentation"${widthAttr} cellpadding="0" cellspacing="0" style="${style}">${rows}</table>`;
}

/** The `primary` `lg` button: the one action the email exists for. */
function button(href: string, label: string): string {
  return table(
    'margin: 0 0 24px;',
    `<tr><td style="background-color: ${B.primary}; border-radius: 10px;"><a href="${href}" style="display: inline-block; padding: 11px 32px; ${FONT_FAMILY} color: ${B.primaryForeground}; ${TITLE} text-decoration: none;">${label}</a></td></tr>`,
    null,
  );
}

/** A panel inside the card: `radius-panel`, 20px padding, on a wash or behind a hairline. */
function panel(style: string, content: string): string {
  return table(
    `margin: 0 0 24px; border-collapse: separate; border-radius: 14px; ${style}`,
    `<tr><td style="padding: 20px; ${FONT}">${content}</td></tr>`,
  );
}

function borderedBox(content: string): string {
  return panel(`border: 1px solid ${B.border};`, content);
}

/** The Statement: a title in the tone's ink, then a sentence in `foreground`. */
const TONES = {
  pending: { ink: B.pending, wash: B.pendingWash },
  inert: { ink: B.inert, wash: B.inertWash },
} as const;

function statement(
  tone: keyof typeof TONES,
  title: string,
  detail: string,
): string {
  const { ink, wash } = TONES[tone];
  return panel(
    `background-color: ${wash};`,
    `<p style="margin: 0 0 4px; color: ${ink}; ${TITLE}">${title}</p><p style="margin: 0;">${detail}</p>`,
  );
}

/** Label/value rows over hairlines, the label column 120px. */
function rows(entries: [label: string, value: string][]): string {
  return table(
    'border-collapse: collapse;',
    entries
      .map(([label, value], i) => {
        const rule = i ? `border-top: 1px solid ${B.border}; ` : '';
        return `<tr><td width="120" valign="top" style="padding: 10px 16px 10px 0; ${rule}${FONT} color: ${B.mutedForeground}; font-size: 14px;">${label}</td><td valign="top" style="padding: 10px 0; ${rule}${FONT} font-size: 14px;">${value}</td></tr>`;
      })
      .join(''),
  );
}

function wrap(t: Catalogue['t'], body: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body style="margin: 0; padding: 0; background-color: ${B.background};">
    ${table(
      `background-color: ${B.background};`,
      `<tr><td align="center" style="padding: 32px 12px;">${table(
        `background-color: ${B.card}; max-width: 680px; width: 100%; border-collapse: separate; border-radius: 20px;`,
        `<tr><td style="padding: 20px 32px; border-bottom: 1px solid ${B.border}; ${FONT} font-size: 16px; font-weight: 600;">${t('app_service_name')}</td></tr>` +
          `<tr><td style="padding: 32px 32px 8px; ${FONT}">${body}</td></tr>` +
          `<tr><td style="padding: 20px 32px; border-top: 1px solid ${B.border}; ${FONT} font-size: 13px; color: ${B.mutedForeground};">${t('app_department')}<br>${figure(t('app_telephone'))}</td></tr>`,
        '680',
      )}</td></tr>`,
    )}
  </body>
</html>`;
}

function paragraph(text: string, style = ''): string {
  return `<p style="margin: 0 0 24px; ${style}">${text}</p>`;
}

function muted(text: string): string {
  return paragraph(text, `color: ${B.mutedForeground}; font-size: 13px;`);
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

function renderDelivery(
  catalogueInstance: Catalogue,
  p: DeliveryParams,
): RenderedMail {
  const { locale } = catalogueInstance;
  const t = catalogueInstance.t.bind(catalogueInstance);
  return {
    subject: t('email_delivery_subject', { reference: p.reference }),
    html: wrap(
      t,
      [
        paragraph(t('email_greeting', { name: escapeHtml(p.name) })),
        paragraph(t('email_delivery_body', { reference: figure(p.reference) })),
        button(p.downloadUrl, t('email_delivery_download')),
        borderedBox(
          `<p style="margin: 0 0 8px; ${TITLE}">${t('requester_confirm_ask_heading')}</p>` +
            rows([
              [
                t('requester_group_heading'),
                escapeHtml(p.ask.diseaseGroupName),
              ],
              [
                t('requester_dates_heading'),
                figure(
                  `${formatDay(locale, p.ask.startDate)} – ${formatDay(locale, p.ask.endDate)}`,
                ),
              ],
              [
                t('requester_area_heading'),
                escapeHtml(areaHeadline(t, p.ask.area)),
              ],
            ]),
        ),
        paragraph(t('email_delivery_expiry_note')),
        panel(
          `background-color: ${B.pendingWash};`,
          `<p style="margin: 0 0 4px;">${t('email_delivery_zip_note')}</p><p style="margin: 0; color: ${B.pending}; font-weight: 600;">${t('email_delivery_no_forward')}</p>`,
        ),
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
        // Calm, not red: a rejection is an outcome, not a fault (system.md).
        statement(
          'inert',
          t('email_rejection_outcome', { reference: figure(p.reference) }),
          t('email_rejection_no_reason'),
        ),
        muted(
          t('email_rejection_contact', {
            telephone: figure(t('app_telephone')),
          }),
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
        statement(
          'pending',
          t('email_failure_body', { reference: figure(p.reference) }),
          t('email_failure_requester_unaware'),
        ),
        paragraph(
          `${strong(t('email_failure_not_your_job_heading'))}<br>${t('email_failure_not_your_job_detail')}`,
        ),
        paragraph(
          t('email_failure_action_note', {
            zone: strong(t('reviewer_alerts_heading')),
          }),
        ),
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
        borderedBox(
          rows([
            [t('email_queue_requester'), escapeHtml(p.requesterName)],
            [t('email_queue_workplace'), escapeHtml(p.workplace)],
            [t('email_queue_deadline'), figure(p.deadline)],
          ]),
        ),
        button(p.queueUrl, t('email_queue_open')),
        paragraph(t('email_queue_no_data_note')),
        muted(t('email_queue_notification_note')),
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
      return renderDelivery(catalogueInstance, params);
    case 'rejection':
      return renderRejection(t, params);
    case 'extraction_failure':
      return renderExtractionFailure(t, params);
    case 'queue_notification':
      return renderQueueNotification(t, params);
  }
}
