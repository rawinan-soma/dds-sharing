import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { type Request } from 'express';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { planRequest } from './plan-request';
import { RequestsService } from './requests.service';

// Deliberately carries no reference number and no status: suppression is keyed
// on an IP, a สคร. office is one IP, and the request in progress may be a
// colleague's (design handoff, screen 3).
export const IN_PROGRESS_MESSAGE =
  'You already have a request in progress. A new one can be sent once it has a decision.';

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly provinces: ProvinceLookup,
  ) {}

  @Post()
  @HttpCode(201)
  async submit(@Body() body: unknown, @Req() req: Request) {
    const planned = planRequest(body, { provinces: this.provinces.provinces });
    if (!planned.ok) {
      throw new BadRequestException({
        code: 'invalid_request',
        errors: planned.errors,
      });
    }

    // One client is one IP, whichever family the socket reported it in.
    const ip = (req.ip ?? req.socket.remoteAddress)?.replace(/^::ffff:/i, '');
    if (!ip) {
      throw new BadRequestException({
        code: 'no_origin',
        message: 'The network origin of this request is unknown.',
      });
    }

    const outcome = await this.requests.submit(planned.plan, {
      ip,
      userAgent: req.get('user-agent') ?? '',
    });
    if (outcome.status === 'in_progress') {
      throw new ConflictException({
        code: 'request_in_progress',
        message: IN_PROGRESS_MESSAGE,
      });
    }

    // The reference number and nothing else: never a row count (§4.1).
    return { reference: outcome.reference };
  }
}
