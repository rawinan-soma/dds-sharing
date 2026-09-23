import { Controller, Get, Res } from '@nestjs/common';
import { type Response } from 'express';
import { catalogue } from '../i18n/copy-catalogue';
import { renderExpiredPage } from './pages';

// `/link-expired` itself (spec §9.4, ADR 0018) — every dead-token redirect in
// DeliveryController points here; it must exist outside `/d/:token` so a bare
// GET renders the one identical page rather than 404ing.
@Controller('link-expired')
export class LinkExpiredController {
  @Get()
  page(@Res() res: Response): void {
    res.status(200).type('html').send(renderExpiredPage(catalogue));
  }
}
