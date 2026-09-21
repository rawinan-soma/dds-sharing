import type { ServerResponse } from 'node:http';

/**
 * `X-Robots-Tag: noindex` on the SPA shell whenever it is served for
 * /reviewer/... The surface is not linked from the public app and stays out of
 * search results. That is tidiness, not security: no protection is claimed for
 * the URL, and nobody should later treat the path as a secret worth guarding.
 * Wired into the static handler because the shell is served there, before any
 * route of ours could see it.
 */
export function keepReviewerSurfaceOutOfSearch(res: ServerResponse) {
  const url = (res as ServerResponse & { req?: { originalUrl?: string } }).req
    ?.originalUrl;
  if (
    url === '/reviewer' ||
    url?.startsWith('/reviewer/') ||
    url?.startsWith('/reviewer?')
  ) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
}
