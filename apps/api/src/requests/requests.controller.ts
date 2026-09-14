import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { RequestsService } from "./requests.service.js";
import type { SubmitRequestInput } from "./submit-request.types.js";

@Controller("requests")
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() body: SubmitRequestInput, @Req() req: Request) {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const userAgent = req.get("user-agent") ?? "unknown";

    const outcome = await this.requestsService.submit(body, { ip, userAgent });

    if (outcome.kind === "validation_error") {
      throw new BadRequestException({ errors: outcome.errors });
    }

    // §4.8: a friendly "you already have a request in progress" — UX, not a
    // rate limit. 409 is the nearest HTTP status to "this exact action
    // conflicts with your own unfinished one".
    if (outcome.kind === "duplicate") {
      throw new ConflictException({
        code: "request_in_progress",
        existingReferenceNumber: outcome.existingReferenceNumber,
        existingState: outcome.existingState,
        existingSubmittedAt: outcome.existingSubmittedAt,
      });
    }

    return {
      referenceNumber: outcome.referenceNumber,
      diseaseGroupNameTh: outcome.diseaseGroupNameTh,
      from: outcome.from,
      to: outcome.to,
      days: outcome.days,
      area: outcome.area,
      servicePromiseBusinessHours: 24,
    };
  }
}
