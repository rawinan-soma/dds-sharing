import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  SESSION_COOKIE,
  CSRF_COOKIE,
  clearSessionCookie,
  issueCsrfCookie,
  readCookie,
  setSessionCookie,
} from './cookies';
import { CsrfGuard } from './csrf.guard';
import { ReviewerAuth, type Origin } from './reviewer-auth';
import {
  AllowPasswordChangePending,
  ReviewerAuthGuard,
  type ReviewerRequest,
} from './reviewer-auth.guard';
import { REVIEWER_CONFIG, type ReviewerConfig } from './reviewer-config';
import { ReviewerSessions } from './reviewer-sessions';

/** The one message every failed sign-in gets, whichever factor failed. */
const SIGN_IN_FAILED = { error: 'sign_in_failed' };

const USER_AGENT_MAX = 512;

function originOf(req: Request): Origin {
  return {
    ip: req.ip ?? '0.0.0.0',
    userAgent: (req.get('user-agent') ?? '').slice(0, USER_AGENT_MAX),
  };
}

function strings<K extends string>(body: unknown, keys: readonly K[]) {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException({ error: 'bad_request' });
  }
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value !== 'string') {
      throw new BadRequestException({ error: 'bad_request' });
    }
    out[key] = value;
  }
  return out;
}

// The API behind /reviewer. There is deliberately no route for recovery codes,
// email reset or TOTP re-enrolment: those go through the host CLI (§17.5).
@Controller('reviewer')
@UseGuards(CsrfGuard)
export class ReviewerController {
  constructor(
    private readonly auth: ReviewerAuth,
    @Inject(ReviewerSessions) private readonly sessions: ReviewerSessions,
    @Inject(REVIEWER_CONFIG) private readonly config: ReviewerConfig,
  ) {}

  // The page asks this on load. It is read-only and never slides the idle
  // window: a reload that keeps a session alive would be a poll by another name.
  @Get('session')
  async session(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!readCookie(req, CSRF_COOKIE)) issueCsrfCookie(res, this.config);
    const resolved = await this.sessions.resolve(
      readCookie(req, SESSION_COOKIE),
      { touch: false },
    );
    if (resolved.status === 'valid') {
      return {
        authenticated: true,
        displayName: resolved.session.displayName,
        expiresAt: resolved.session.expiresAt.toISOString(),
        mustChangePassword: resolved.session.mustChangePassword,
      };
    }
    return resolved.status === 'expired'
      ? { authenticated: false, expired: true }
      : { authenticated: false };
  }

  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = strings(body, ['username', 'password', 'code']);
    const result = await this.auth.signIn(input, originOf(req));

    if (result.status === 'throttled') {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429);
      return {
        error: 'throttled',
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    if (result.status === 'failed') {
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    setSessionCookie(res, this.config, result.token, result.expiresAt);
    // A fresh double-submit token for the new session.
    issueCsrfCookie(res, this.config);
    return {
      displayName: result.displayName,
      expiresAt: result.expiresAt.toISOString(),
      mustChangePassword: result.mustChangePassword,
    };
  }

  @Post('sign-out')
  @HttpCode(204)
  @UseGuards(ReviewerAuthGuard)
  @AllowPasswordChangePending()
  async signOut(
    @Req() req: ReviewerRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const reviewer = req.reviewer!;
    await this.auth.signOut(reviewer.sessionToken, reviewer.reviewerId);
    clearSessionCookie(res, this.config);
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(ReviewerAuthGuard)
  @AllowPasswordChangePending()
  async changePassword(
    @Body() body: unknown,
    @Req() req: ReviewerRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = strings(body, ['currentPassword', 'newPassword', 'code']);
    const reviewer = req.reviewer!;
    const result = await this.auth.changePassword(
      {
        ...input,
        reviewerId: reviewer.reviewerId,
        sessionToken: reviewer.sessionToken,
      },
      originOf(req),
    );

    if (result.status === 'throttled') {
      res.setHeader('Retry-After', String(result.retryAfterSeconds));
      res.status(429);
      return {
        error: 'throttled',
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }
    if (result.status === 'failed') {
      throw new UnauthorizedException(SIGN_IN_FAILED);
    }
    if (result.status === 'policy') {
      throw new UnprocessableEntityException({
        error: 'password_policy',
        violations: result.violations,
      });
    }
  }
}
