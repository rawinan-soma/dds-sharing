import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { CsrfGuard } from "./csrf.guard.js";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard.js";
import { requestContext } from "./request-context.js";
import { generateCsrfToken } from "./csrf.js";
import {
  REVIEWER_CSRF_COOKIE,
  REVIEWER_SESSION_COOKIE,
  reviewerCsrfCookieOptions,
  reviewerSessionCookieOptions,
} from "./cookie-options.js";
interface SignInBody {
  username: string;
  password: string;
  totpCode: string;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
  totpCode: string;
}

// No security is claimed for the route itself (spec §17.4) — nothing here
// guards *this path*, only what it does. Every state-changing action below
// still requires the CSRF double-submit token, and sign-in still returns one
// generic failure regardless of which factor was wrong.
@Controller("reviewer")
export class ReviewerController {
  constructor(private readonly authService: AuthService) {}

  /** Issues the CSRF cookie the sign-in form must echo back as a header. */
  @Get("csrf")
  issueCsrfToken(@Res({ passthrough: true }) res: Response) {
    const token = generateCsrfToken();
    res.cookie(REVIEWER_CSRF_COOKIE, token, reviewerCsrfCookieOptions());
    return { csrfToken: token };
  }

  @UseGuards(SessionGuard)
  @Get("session")
  async whoAmI(@Req() req: AuthenticatedRequest) {
    const reviewer = await this.authService.currentReviewer(req.reviewerId);
    return { reviewerId: req.reviewerId, ...reviewer };
  }

  @UseGuards(CsrfGuard)
  @Post("session")
  @HttpCode(200)
  async signIn(@Body() body: SignInBody, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signIn(body.username, body.password, body.totpCode, requestContext(req));

    if (result.outcome !== "success") {
      res.status(result.outcome === "throttled" ? 429 : 401);
      return { error: result.outcome };
    }

    res.cookie(REVIEWER_SESSION_COOKIE, result.token, reviewerSessionCookieOptions(result.absoluteExpiresAt));
    return {
      displayName: result.displayName,
      mustChangePassword: result.mustChangePassword,
      absoluteExpiresAt: result.absoluteExpiresAt,
    };
  }

  @UseGuards(CsrfGuard)
  @Delete("session")
  @HttpCode(204)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = req.cookies?.[REVIEWER_SESSION_COOKIE] as string | undefined;
    if (token) {
      await this.authService.signOut(token, requestContext(req));
    }
    res.clearCookie(REVIEWER_SESSION_COOKIE);
  }

  @UseGuards(SessionGuard, CsrfGuard)
  @Patch("password")
  @HttpCode(200)
  async changePassword(
    @Body() body: ChangePasswordBody,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(req.reviewerId, body.currentPassword, body.newPassword, body.totpCode);
    if (result.outcome === "throttled") res.status(429);
    return result;
  }
}
