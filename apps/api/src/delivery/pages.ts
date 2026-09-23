import { type Catalogue } from '../i18n/copy-catalogue';
import { ATTEMPT_CAP } from './resolve-token';
import { formatBytes, formatHoursLeft } from './format';

// Both server-rendered pages of ADR 0018/spec §9.1, §9.4 — NestJS templates,
// no Angular bundle, no required script (the guarantee ADR 0003 rests on).
// Deliberately plain, semantic HTML rather than a templating engine: two
// pages does not earn a dependency.

function row(label: string, value: string): string {
  return `<div class="row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
}

function page(locale: string, title: string, body: string): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 24px 16px; background: #f4f4f4; color: #1a1a1a; }
  main { max-width: 480px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 6px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 15px; margin: 20px 0 4px; }
  p { margin: 0 0 12px; line-height: 1.5; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e0e0e0; }
  .label { color: #666; }
  .value { font-weight: bold; }
  .button { display: inline-block; margin-top: 16px; padding: 12px 24px; background: #0b5fff; color: #fff; text-decoration: none; border-radius: 4px; font-weight: bold; }
</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

export interface CollectionPageData {
  reference: string;
  archiveFilename: string;
  sizeBytes: number;
  attemptsUsed: number;
  timeLeftMs: number;
  archiveUrl: string;
}

/** `GET /d/<token>` on a live token — file name, size, time left, attempts used (ADR 0018). */
export function renderCollectionPage(
  catalogueInstance: Catalogue,
  data: CollectionPageData,
): string {
  const t = catalogueInstance.t.bind(catalogueInstance);
  const body = `
<h1>${t('requester_collect_title')}</h1>
${row(t('requester_confirm_reference_label'), data.reference)}
${row(t('requester_collect_filename'), data.archiveFilename)}
${row(t('requester_collect_size'), formatBytes(data.sizeBytes))}
${row(
  t('requester_collect_attempts'),
  t('requester_collect_attempts_value', {
    used: data.attemptsUsed,
    cap: ATTEMPT_CAP,
  }),
)}
${row('', t('requester_collect_time_left', { time: formatHoursLeft(data.timeLeftMs) }))}
<a class="button" href="${data.archiveUrl}">${t('requester_collect_download')}</a>
<p>${t('requester_collect_deleted_after')}</p>
<h2>${t('requester_collect_zip_heading')}</h2>
<p>${t('requester_collect_zip_detail')}</p>
<h2>${t('requester_collect_no_forward_heading')}</h2>
<p>${t('requester_collect_no_forward_detail')}</p>
<h2>${t('requester_collect_audited_heading')}</h2>
<p>${t('requester_collect_audited_detail')}</p>
<p>${t('requester_collect_help', { telephone: t('app_telephone') })}</p>`;
  return page(catalogueInstance.locale, t('requester_collect_title'), body);
}

/**
 * `/link-expired` (spec §9.4): one page, one sentence, plus the telephone
 * number, always identical. Takes no data — the four dead-token causes
 * (unknown token, expired, exhausted attempts, deleted object) are
 * distinguished in the audit record and nowhere else, on purpose: showing
 * anything more here would tell someone walking the token space which
 * guesses landed.
 */
export function renderExpiredPage(catalogueInstance: Catalogue): string {
  const t = catalogueInstance.t.bind(catalogueInstance);
  const body = `
<h1>${t('requester_expired_title')}</h1>
<p>${t('requester_expired_body', { telephone: t('app_telephone') })}</p>`;
  return page(catalogueInstance.locale, t('requester_expired_title'), body);
}
