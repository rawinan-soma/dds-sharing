import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { CSRF_HEADER } from "./csrf.js";
import { csrfTokensMatch } from "./csrf.js";
import { REVIEWER_CSRF_COOKIE } from "./cookie-options.js";

/** Double-submit CSRF check for every state-changing `/reviewer` POST (spec §17.5). */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieValue = request.cookies?.[REVIEWER_CSRF_COOKIE] as string | undefined;
    const headerValue = request.headers[CSRF_HEADER] as string | undefined;
    if (!csrfTokensMatch(cookieValue, headerValue)) {
      throw new ForbiddenException("csrf_token_mismatch");
    }
    return true;
  }
}
