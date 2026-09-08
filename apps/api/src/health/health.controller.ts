import { Controller, Get } from "@nestjs/common";
import { HealthService } from "./health.service.js";
import type { HealthDocument } from "./health.service.js";

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("health")
  check(): HealthDocument {
    return this.healthService.check();
  }

  @Get("health/scheduler")
  checkSchedulerAlias(): HealthDocument {
    return this.healthService.check();
  }
}
