import { Controller, Get, NotFoundException, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { AppConfigService } from '../config/app-config.service.js';

// The NestJS-owned prefixes from §16.2 — never swallowed by the SPA fallback,
// even for a sub-path no controller has claimed yet.
const RESERVED_PREFIXES = ['/api', '/health', '/d'];

// `dotfiles: 'allow'` because express's default treats ANY path segment
// starting with `.` as hidden and 404s it — and this project's own checkout
// path can contain one (e.g. a worktree under `.ao/`). The file served here
// is always our own build output, never a caller-supplied path.
const SEND_FILE_OPTIONS = { dotfiles: 'allow' as const };

@Controller()
export class SpaController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  serveRoot(@Res() res: Response) {
    res.sendFile(join(this.config.staticRoot, 'index.html'), SEND_FILE_OPTIONS);
  }

  @Get('*splat')
  serveFallback(@Req() req: Request, @Res() res: Response) {
    if (RESERVED_PREFIXES.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
      throw new NotFoundException();
    }
    res.sendFile(join(this.config.staticRoot, 'index.html'), SEND_FILE_OPTIONS);
  }
}
