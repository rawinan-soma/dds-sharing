import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { SESSION_COOKIE, readCookie } from './cookies';
import { ReviewerSessions, type ActiveSession } from './reviewer-sessions';

const PENDING_CHANGE_OK = 'reviewer:allow-password-change-pending';

/**
 * Opts a route in for a Reviewer who still owes the forced first-login password
 * change. Everything else is refused until it is made, so a screen a later
 * ticket adds is gated by default rather than by remembering to.
 */
export const AllowPasswordChangePending = () =>
  SetMetadata(PENDING_CHANGE_OK, true);

export interface AuthenticatedReviewer extends ActiveSession {
  sessionToken: string;
}

export type ReviewerRequest = Request & { reviewer?: AuthenticatedReviewer };

// The one door onto anything a Reviewer may do. A request through it is a
// user-initiated one and slides the idle window; the ceiling it never touches.
@Injectable()
export class ReviewerAuthGuard implements CanActivate {
  constructor(
    @Inject(ReviewerSessions) private readonly sessions: ReviewerSessions,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ReviewerRequest>();
    const token = readCookie(req, SESSION_COOKIE);
    const resolved = await this.sessions.resolve(token, { touch: true });

    if (resolved.status === 'expired') {
      throw new UnauthorizedException({ error: 'session_expired' });
    }
    if (resolved.status === 'none' || !token) {
      throw new UnauthorizedException({ error: 'unauthenticated' });
    }
    const allowPending = this.reflector.getAllAndOverride<boolean>(
      PENDING_CHANGE_OK,
      [context.getHandler(), context.getClass()],
    );
    if (resolved.session.mustChangePassword && !allowPending) {
      throw new ForbiddenException({ error: 'password_change_required' });
    }
    req.reviewer = { ...resolved.session, sessionToken: token };
    return true;
  }
}
