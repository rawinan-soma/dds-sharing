import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  csrfTokensMatch,
  readCookie,
} from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit token on every state-changing /reviewer request, on top of
// SameSite=Lax. Justified by what it protects: a one-click, irreversible release
// of case-level personal data with a named human's identity attached.
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const cookie = readCookie(req, CSRF_COOKIE);
    const header = req.headers[CSRF_HEADER];
    if (
      !cookie ||
      typeof header !== 'string' ||
      !csrfTokensMatch(cookie, header)
    ) {
      throw new ForbiddenException({ error: 'csrf' });
    }
    return true;
  }
}
