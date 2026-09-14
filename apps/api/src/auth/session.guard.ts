import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service.js";
import { REVIEWER_SESSION_COOKIE } from "./cookie-options.js";
import { requestContext } from "./request-context.js";

export interface AuthenticatedRequest extends Request {
  reviewerId: string;
}

/** Requires a live `/reviewer` session cookie. Sliding the idle window and recording `session_expired` are AuthService's job, not this guard's. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[REVIEWER_SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException("no_session");

    const result = await this.authService.validateSession(token, requestContext(request));
    if (result.outcome !== "valid") throw new UnauthorizedException(result.outcome === "expired" ? result.reason : "no_session");

    request.reviewerId = result.reviewerId;
    return true;
  }
}
