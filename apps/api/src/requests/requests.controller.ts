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

// Deliberately carries no reference number and no status: the match is on an
// unverified email, so anyone typing another person's address and ask would
// otherwise be shown that person's Request (design handoff, screen 3).
export const IN_PROGRESS_MESSAGE =
  'You already sent this request. It was saved, so there is no need to send it again. A different ask, or a corrected email, can be sent now.';

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

    // For the audit record: one client is one IP, whichever family the socket
    // reported it in.
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
