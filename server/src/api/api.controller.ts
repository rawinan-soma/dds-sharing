import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class ApiController {
  // Proves the static SPA handler excludes /api rather than swallowing it.
  @Get()
  ping() {
    return { ok: true };
  }
}
