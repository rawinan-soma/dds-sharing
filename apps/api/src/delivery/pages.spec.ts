import { describe, expect, it } from 'vitest';
import { B, DRAWN } from '../design/b-tokens';
import { catalogue } from '../i18n/copy-catalogue';
import { renderCollectionPage, renderExpiredPage } from './pages';

describe('renderCollectionPage', () => {
  const html = renderCollectionPage(catalogue, {
    reference: 'REQ-2569-0001',
    archiveFilename: 'REQ-2569-0001.zip',
    sizeBytes: 5 * 1024 * 1024,
    attemptsUsed: 3,
    timeLeftMs: 48 * 60 * 60 * 1000,
    archiveUrl: 'https://frontend.test/d/abc123/archive',
  });

  it('shows the reference, file name, size, attempts and time left', () => {
    expect(html).toContain('REQ-2569-0001');
    expect(html).toContain('REQ-2569-0001.zip');
    expect(html).toContain('5.0 MB');
    expect(html).toContain('3 of 10 times');
    expect(html).toContain('48 hours');
  });

  it('links the download button at the archive route', () => {
    expect(html).toContain('href="https://frontend.test/d/abc123/archive"');
  });

  it('carries no script tag — it must work with no Angular bundle (ADR 0003)', () => {
    expect(html).not.toContain('<script');
  });
});

describe('renderExpiredPage', () => {
  const html = renderExpiredPage(catalogue);

  it('renders one sentence plus the telephone number', () => {
    expect(html).toContain(catalogue.t('requester_expired_title'));
    expect(html).toContain(catalogue.t('app_telephone'));
  });

  it('carries no reference number placeholder and no resubmit link', () => {
    expect(html).not.toContain('REQ-');
    expect(html.toLowerCase()).not.toContain('resubmit');
  });

  it('carries no script tag', () => {
    expect(html).not.toContain('<script');
  });
});

describe('both pages', () => {
  const pages = {
    collection: renderCollectionPage(catalogue, {
      reference: 'REQ-2569-0001',
      archiveFilename: 'REQ-2569-0001.zip',
      sizeBytes: 1024,
      attemptsUsed: 0,
      timeLeftMs: 60 * 60 * 1000,
      archiveUrl: 'https://frontend.test/d/abc123/archive',
    }),
    expired: renderExpiredPage(catalogue),
  };

  it.each(Object.entries(pages))(
    'colours the %s page with B tokens and drawn values only',
    (_, html) => {
      const allowed = new Set<string>([
        ...Object.values(B),
        ...Object.values(DRAWN),
      ]);
      const used = [...html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(([c]) =>
        c.toLowerCase(),
      );
      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((c) => !allowed.has(c))).toEqual([]);
    },
  );
});
