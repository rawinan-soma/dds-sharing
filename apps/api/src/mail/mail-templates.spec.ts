import { describe, expect, it } from 'vitest';
import { catalogue } from '../i18n/copy-catalogue';
import { renderMail, type MailParams } from './mail-templates';

describe('renderMail', () => {
  it('renders the Delivery email with the reference in the subject and the download link as a button href', () => {
    const params: MailParams = {
      kind: 'delivery',
      name: 'Somchai',
      reference: 'REQ-2569-0001',
      downloadUrl: 'https://frontend.test/d/abc123',
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
    });
    expect(html.toLowerCase()).not.toContain('bounce');
  });
});
