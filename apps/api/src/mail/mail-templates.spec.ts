import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { B } from '../design/b-tokens';
import { type Catalogue, catalogue, interpolate } from '../i18n/copy-catalogue';
import {
  renderMail,
  type DeliveryParams,
  type MailParams,
} from './mail-templates';

/** The real th.json, as the catalogue will serve it once #96 flips the base locale. */
function thaiCatalogue(): Catalogue {
  const messages = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../../../../messages/th.json',
      ),
      'utf-8',
    ),
  ) as Record<string, string>;
  return {
    locale: 'th',
    t: (key, params) => interpolate(messages[key], params),
  };
}

const ASK: DeliveryParams['ask'] = {
  diseaseGroupName: 'โรคจากตะกั่วและสารประกอบของตะกั่ว',
  startDate: '2025-01-01',
  endDate: '2025-05-31',
  area: { kind: 'national' },
};

describe('renderMail', () => {
  it('renders the Delivery email with the reference in the subject and the download link as a button href', () => {
    const params: MailParams = {
      kind: 'delivery',
      name: 'Somchai',
      reference: 'REQ-2569-0001',
      downloadUrl: 'https://frontend.test/d/abc123',
      ask: ASK,
    };
    const { subject, html } = renderMail(catalogue, params);
    expect(subject).toContain('REQ-2569-0001');
    expect(html).toContain('href="https://frontend.test/d/abc123"');
    expect(html).toContain('Somchai');
  });

  it('renders the rejection email with no reason given and the telephone number', () => {
    const params: MailParams = {
      kind: 'rejection',
      name: 'Somchai',
      reference: 'REQ-2569-0002',
    };
    const { subject, html } = renderMail(catalogue, params);
    expect(subject).toContain('REQ-2569-0002');
    expect(html).toContain(catalogue.t('app_telephone'));
    expect(html).toContain(catalogue.t('email_rejection_no_reason'));
  });

  it('renders the extraction-failure email telling the Reviewer this is not their fault', () => {
    const params: MailParams = {
      kind: 'extraction_failure',
      name: 'Reviewer One',
      reference: 'REQ-2569-0003',
    };
    const { html } = renderMail(catalogue, params);
    expect(html).toContain(catalogue.t('email_failure_not_your_job_heading'));
  });

  it('renders the queue notification with the requester, workplace, deadline and queue link', () => {
    const params: MailParams = {
      kind: 'queue_notification',
      reference: 'REQ-2569-0004',
      requesterName: 'Somchai Devkul',
      workplace: 'สคร. 1',
      deadline: '2026-09-25 08:30 ICT',
      queueUrl: 'https://frontend.test/reviewer',
    };
    const { html } = renderMail(catalogue, params);
    expect(html).toContain('Somchai Devkul');
    expect(html).toContain('สคร. 1');
    expect(html).toContain('2026-09-25 08:30 ICT');
    expect(html).toContain('href="https://frontend.test/reviewer"');
  });

  it('HTML-escapes a Requester-supplied name — free text from the unauthenticated public form', () => {
    const { html } = renderMail(catalogue, {
      kind: 'delivery',
      name: '<img src=x onerror=alert(1)>',
      reference: 'REQ-2569-0006',
      downloadUrl: 'https://frontend.test/d/abc123',
      ask: ASK,
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('HTML-escapes the queue notification requester name and workplace — they reach a Reviewer inbox', () => {
    const { html } = renderMail(catalogue, {
      kind: 'queue_notification',
      reference: 'REQ-2569-0007',
      requesterName: '<script>alert(1)</script>',
      workplace: '<b>fake</b> workplace',
      deadline: '2026-09-25 08:30 ICT',
      queueUrl: 'https://frontend.test/reviewer',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>fake</b>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('never mentions a mail_bounced-style promise (spec §11.1) — smoke check that templates carry no stray copy', () => {
    const { html } = renderMail(catalogue, {
      kind: 'delivery',
      name: 'Somchai',
      reference: 'REQ-2569-0005',
      downloadUrl: 'https://frontend.test/d/xyz',
      ask: ASK,
    });
    expect(html.toLowerCase()).not.toContain('bounce');
  });

  describe('in the B design system (docs/design/system.md, screen 9)', () => {
    const delivery: MailParams = {
      kind: 'delivery',
      name: 'Somchai',
      reference: 'REQ-2569-0010',
      downloadUrl: 'https://frontend.test/d/tok_abc-123',
      ask: ASK,
    };
    const rejection: MailParams = {
      kind: 'rejection',
      name: 'Somchai',
      reference: 'REQ-2569-0011',
    };
    const failure: MailParams = {
      kind: 'extraction_failure',
      name: 'Reviewer One',
      reference: 'REQ-2569-0012',
    };
    const queue: MailParams = {
      kind: 'queue_notification',
      reference: 'REQ-2569-0013',
      requesterName: 'Somchai Devkul',
      workplace: 'สคร. 1',
      deadline: '2026-09-25 08:30 ICT',
      queueUrl: 'https://frontend.test/reviewer',
    };
    const all = [delivery, rejection, failure, queue];

    // The B tokens, held to system.md by b-tokens.spec.ts, and nothing else.
    const B_TOKENS = new Set<string>(Object.values(B));
    // The old system's colours, named so a regression to them reads as one.
    const OLD_SYSTEM = ['#1a1a1a', '#f4f4f4', '#0b5fff', '#e0e0e0', '#666666'];
    const colours = (html: string) =>
      [...html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(([c]) => c.toLowerCase());

    it.each(all)('uses only B token colours in the $kind email', (params) => {
      const { html } = renderMail(catalogue, params);
      const used = colours(html);
      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((c) => !B_TOKENS.has(c))).toEqual([]);
      expect(used.filter((c) => OLD_SYSTEM.includes(c))).toEqual([]);
    });

    it.each(all)(
      'sets the $kind email in the 680px shell, tables and inline styles only',
      (params) => {
        const { html } = renderMail(catalogue, params);
        expect(html).toContain('width="680"');
        expect(html).toContain('max-width: 680px');
        expect(html).not.toMatch(/<style|<link|class="/);
        expect(html).not.toMatch(/<div/);
      },
    );

    it('puts the ask in a bordered box in the delivery email, and no row count', () => {
      const { html } = renderMail(catalogue, delivery);
      expect(html).toContain('border: 1px solid #dfe1e6');
      expect(html).toContain(catalogue.t('requester_confirm_ask_heading'));
      expect(html).toContain('โรคจากตะกั่วและสารประกอบของตะกั่ว');
      expect(html).toContain(catalogue.t('requester_area_national'));
      expect(html.toLowerCase()).not.toMatch(/\brows?\b|แถว/);
    });

    it("words the dates in the email's language: English days for an English catalogue", () => {
      expect(catalogue.locale).toBe('en');
      const { html } = renderMail(catalogue, delivery);
      expect(html).toContain('1 January 2025 – 31 May 2025');
      expect(html).not.toContain('2568');
    });

    it("words the dates in the email's language: Buddhist-era Thai days for a Thai catalogue", () => {
      const { html } = renderMail(thaiCatalogue(), delivery);
      expect(html).toContain('1 มกราคม 2568 – 31 พฤษภาคม 2568');
      expect(html).toContain('กลุ่มโรค');
    });

    it('keeps the delivery download link the fixed /d/<token> URL, on a primary button', () => {
      const { html } = renderMail(catalogue, delivery);
      expect(html).toContain('href="https://frontend.test/d/tok_abc-123"');
      expect(html).toContain('background-color: #3b5bfd');
      expect(html).toContain(catalogue.t('email_delivery_download'));
    });

    it('sets do-not-forward in pending on pending-wash in the delivery email', () => {
      const { html } = renderMail(catalogue, delivery);
      expect(html).toContain('background-color: #fdf3dc');
      expect(html).toMatch(
        new RegExp(
          `color: #8a5a00[^>]*>${catalogue.t('email_delivery_no_forward')}`,
        ),
      );
    });

    it('names the area as the Requester picked it', () => {
      const area = (a: DeliveryParams['ask']['area']) =>
        renderMail(catalogue, { ...delivery, ask: { ...ASK, area: a } }).html;
      expect(
        area({
          kind: 'provinces',
          provinces: [{ id: '19', name: 'สระบุรี' }],
          region: null,
        }),
      ).toContain('สระบุรี');
      expect(
        area({
          kind: 'provinces',
          provinces: [
            { id: '12', name: 'นนทบุรี' },
            { id: '13', name: 'ปทุมธานี' },
          ],
          region: 4,
        }),
      ).toContain(catalogue.t('requester_area_region_selected', { region: 4 }));
    });

    it('sets the rejection outcome on an inert-wash panel, not a failure colour, with no reason', () => {
      const { html } = renderMail(catalogue, rejection);
      expect(html).toMatch(
        new RegExp(`background-color: #eceef2[^>]*>[^]*?REQ-2569-0011`),
      );
      expect(html).not.toMatch(/#c42b3a|#fbe9eb/i);
      expect(html).toContain(catalogue.t('email_rejection_no_reason'));
    });

    it('sets reference numbers tabular in the body, and plain in the subject', () => {
      const { subject, html } = renderMail(catalogue, rejection);
      expect(html).toContain(
        '<span style="font-variant-numeric: tabular-nums;">REQ-2569-0011</span>',
      );
      expect(subject).not.toContain('<');
    });

    it('puts the queue notification facts in a bordered box, with no patient data and no download link', () => {
      const { html } = renderMail(catalogue, queue);
      expect(html).toContain('border: 1px solid #dfe1e6');
      expect(html).not.toContain('/d/');
      expect(html).toContain(catalogue.t('email_queue_no_data_note'));
    });

    it('sets the extraction failure on a pending-wash panel and points at the Alert under its zone', () => {
      const { html } = renderMail(catalogue, failure);
      expect(html).toMatch(
        new RegExp(`background-color: #fdf3dc[^>]*>[^]*?REQ-2569-0012`),
      );
      expect(html).toContain(catalogue.t('email_failure_requester_unaware'));
      expect(html).toContain(catalogue.t('email_failure_not_your_job_detail'));
      expect(html).toContain(catalogue.t('reviewer_alerts_heading'));
    });
  });
});
