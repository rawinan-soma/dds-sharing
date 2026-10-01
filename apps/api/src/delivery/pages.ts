import { B, DRAWN } from '../design/b-tokens';
import { type Catalogue } from '../i18n/copy-catalogue';
import { ATTEMPT_CAP } from './resolve-token';
import { formatBytes, formatHoursLeft } from './format';

// Both server-rendered pages of ADR 0018/spec §9.1, §9.4 — NestJS templates,
// no Angular bundle, no required script (the guarantee ADR 0003 rests on).
// Deliberately plain, semantic HTML rather than a templating engine: two
// pages does not earn a dependency.

// The B tokens (src/design/b-tokens.ts), inlined: these pages load no bundle,
// so they cannot share the SPA's stylesheet or its self-hosted fonts, and fall
// back to the platform's Thai face where IBM Plex is not installed.
const STYLE = `
  :root { --background:${B.background}; --card:${B.card}; --foreground:${B.foreground}; --muted:${B.mutedForeground}; --border:${B.border};
    --primary:${B.primary}; --primary-hover:${B.primaryHover}; --primary-wash:${B.primaryWash}; --primary-foreground:${B.primaryForeground};
    --success:${B.success}; --success-wash:${B.successWash}; --pending:${B.pending}; --inert:${B.inert}; --inert-wash:${B.inertWash}; --quiet:${DRAWN.bandGrey}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 16px; background: var(--background); color: var(--foreground);
    font-family: 'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif; font-size: 15px; line-height: 1.65; }
  main { max-width: 640px; margin: 0 auto; background: var(--card); border-radius: 20px;
    box-shadow: 0 30px 60px rgb(0 0 0 / 0.06); padding: 32px; display: flex; flex-direction: column; gap: 20px; }
  main.narrow { max-width: 560px; align-items: center; text-align: center; gap: 16px; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 28px; font-weight: 600; line-height: 1.35; }
  .figure { font-variant-numeric: tabular-nums; }
  .muted { color: var(--muted); }
  .small { font-size: 13px; }
  .file { border: 1px solid var(--border); border-radius: 14px; padding: 20px; display: flex; flex-direction: column; gap: 16px; }
  .file-head { display: flex; gap: 16px; align-items: center; }
  .file-icon { flex: none; width: 44px; height: 44px; border-radius: 14px; background: var(--primary-wash);
    color: var(--primary); display: grid; place-items: center; }
  .file-label { display: none; }
  .file-name { font-weight: 600; overflow-wrap: anywhere; }
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .tile { border-radius: 14px; padding: 12px 12px; background: var(--quiet); }
  .tile .value { font-size: 16px; font-weight: 600; }
  .tile.left { background: var(--success-wash); color: var(--success); }
  .button { display: flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 10px;
    background: var(--primary); color: var(--primary-foreground); font-size: 16px; font-weight: 600; text-decoration: none; }
  .button:hover { background: var(--primary-hover); }
  :focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .notes { display: flex; flex-direction: column; gap: 12px; }
  .note { border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; gap: 14px; }
  .note h2 { font-size: 15px; font-weight: 600; }
  .note p { color: var(--muted); font-size: 14px; }
  .mark { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center;
    color: ${DRAWN.onStateFill}; background: var(--inert); font-size: 13px; font-weight: 700; }
  .mark.pending { background: var(--pending); }
  .phone { color: var(--muted); font-size: 14px; }
  .centered { text-align: center; }
  strong.figure { color: var(--foreground); white-space: nowrap; }
  .broken { width: 56px; height: 56px; border-radius: 50%; background: var(--inert-wash); color: var(--inert);
    display: grid; place-items: center; }
  @media (max-width: 599.98px) {
    body { padding: 16px; }
    main { padding: 20px; }
    h1 { font-size: 22px; }
    .file { border: 0; padding: 0; }
    .file-icon { display: none; }
    .file-label { display: block; }
    .notes { border-top: 1px solid var(--border); padding-top: 16px; display: flex; flex-direction: column; gap: 16px; }
    .note { border: 0; padding: 0; }
    .note .mark { display: none; }
    .note.pending h2 { color: var(--pending); }
  }
`;

const FILE_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3"/></svg>`;
const BROKEN_LINK = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 4 8M8 12h3M4 4l16 16"/></svg>`;

/** The telephone number bold and tabular inside its sentence, as drawn. */
function withPhone(text: string, telephone: string): string {
  return text
    .split(telephone)
    .join(`<strong class="figure">${telephone}</strong>`);
}

const MARKS = {
  info: { modifier: null, glyph: 'i' },
  pending: { modifier: 'pending', glyph: '!' },
};

function note(mark: keyof typeof MARKS, heading: string, detail: string) {
  const { modifier, glyph } = MARKS[mark];
  const extraClass = modifier ? ` ${modifier}` : '';
  return `<div class="note${extraClass}">
<span class="mark${extraClass}" aria-hidden="true">${glyph}</span>
<div><h2>${heading}</h2><p>${detail}</p></div></div>`;
}

function page(
  locale: string,
  title: string,
  body: string,
  narrow = false,
): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body>
<main${narrow ? ' class="narrow"' : ''}>${body}</main>
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
  const telephone = t('app_telephone');
  const body = `
<div>
<p class="muted small figure">${t('requester_collect_reference', { reference: data.reference })}</p>
<h1>${t('requester_collect_title')}</h1>
</div>
<section class="file">
<div class="file-head">
<span class="file-icon">${FILE_ICON}</span>
<div>
<p class="file-label muted small">${t('requester_collect_filename')}</p>
<p class="file-name figure">${data.archiveFilename}</p>
<p class="muted figure">${formatBytes(data.sizeBytes)}</p>
</div>
</div>
<div class="tiles">
<div class="tile"><p class="small">${t('requester_collect_attempts')}</p><p class="value figure">${t(
    'requester_collect_attempts_value',
    { used: data.attemptsUsed, cap: ATTEMPT_CAP },
  )}</p></div>
<div class="tile left"><p class="small">${t('requester_collect_time_left_label')}</p><p class="value figure">${t(
    'requester_collect_time_left',
    { time: formatHoursLeft(data.timeLeftMs) },
  )}</p></div>
</div>
<a class="button" href="${data.archiveUrl}">${t('requester_collect_download')}</a>
<p class="muted small centered">${t('requester_collect_deleted_after')}</p>
</section>
<div class="notes">
${note('info', t('requester_collect_zip_heading'), t('requester_collect_zip_detail'))}
${note('pending', t('requester_collect_no_forward_heading'), t('requester_collect_no_forward_detail'))}
${note('info', t('requester_collect_audited_heading'), t('requester_collect_audited_detail'))}
</div>
<p class="phone">${withPhone(t('requester_collect_help', { telephone }), telephone)}</p>`;
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
  const telephone = t('app_telephone');
  const body = `
<span class="broken">${BROKEN_LINK}</span>
<h1>${t('requester_expired_title')}</h1>
<p class="muted">${withPhone(t('requester_expired_body', { telephone }), telephone)}</p>`;
  return page(
    catalogueInstance.locale,
    t('requester_expired_title'),
    body,
    true,
  );
}
