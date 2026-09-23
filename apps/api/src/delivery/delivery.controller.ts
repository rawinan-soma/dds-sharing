import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { catalogue } from '../i18n/copy-catalogue';
import { DeliveryService } from './delivery.service';
import { renderCollectionPage, renderExpiredPage } from './pages';

// `/link-expired` itself (spec §9.4, ADR 0018) — every dead-token redirect in
// DeliveryController below points here; it must exist outside `/d/:token` so
// a bare GET renders the one identical page rather than 404ing.
@Controller('link-expired')
export class LinkExpiredController {
  @Get()
  page(@Res() res: Response): void {
    res.status(200).type('html').send(renderExpiredPage(catalogue));
  }
}

/** `req.ip`/`req.socket.remoteAddress` may carry the IPv4-mapped IPv6 prefix; every other IP-keyed spot in the codebase strips it the same way (`requests.controller.ts`). */
function clientIp(req: Request): string | undefined {
  return (req.ip ?? req.socket.remoteAddress)?.replace(/^::ffff:/i, '');
}

// `/d/<token>` and `/d/<token>/archive` (spec §16.2, ADR 0018) — deliberately
// outside the `/api` prefix (see `main.ts`): the address travels in email and
// must stay reachable even if the Angular bundle fails to load (ADR 0003).
@Controller('d')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get(':token')
  async page(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = clientIp(req);
    if (!ip) {
      res.redirect(302, '/link-expired');
      return;
    }
    const outcome = await this.delivery.page(
      token,
      { ip, userAgent: req.get('user-agent') ?? '' },
      new Date(),
    );

    if (outcome.kind === 'blocked') {
      res.status(429).type('html').send(renderExpiredPage(catalogue));
      return;
    }
    if (outcome.kind === 'dead') {
      res.redirect(302, '/link-expired');
      return;
    }
    res
      .status(200)
      .type('html')
      .send(
        renderCollectionPage(catalogue, {
          ...outcome,
          archiveUrl: `/d/${token}/archive`,
        }),
      );
  }

  @Get(':token/archive')
  async archive(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = clientIp(req);
    if (!ip) {
      res.redirect(302, '/link-expired');
      return;
    }
    const ctx = { ip, userAgent: req.get('user-agent') ?? '' };
    const outcome = await this.delivery.archive(
      token,
      ctx,
      req.headers.range,
      new Date(),
    );

    if (outcome.kind === 'blocked') {
      res.status(429).type('html').send(renderExpiredPage(catalogue));
      return;
    }
    if (outcome.kind === 'dead') {
      res.redirect(302, '/link-expired');
      return;
    }

    const { ranged, archiveFilename } = outcome;
    res.set('Accept-Ranges', 'bytes');
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${archiveFilename}"`);
    if (ranged.range) {
      res.status(206);
      res.set(
        'Content-Range',
        `bytes ${ranged.range.start}-${ranged.range.end}/${ranged.size}`,
      );
      res.set(
        'Content-Length',
        String(ranged.range.end - ranged.range.start + 1),
      );
    } else {
      res.status(200);
      res.set('Content-Length', String(ranged.size));
    }
    ranged.stream.pipe(res);
  }
}
