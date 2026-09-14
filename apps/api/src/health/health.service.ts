import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import transportConfig from "../config/transport.config.js";
import smtpConfig from "../config/smtp.config.js";
import { activeInsecureFlags } from "../config/insecure-flags.js";

export type HealthComponentStatus = "ok" | "unknown" | "degraded" | "down";

export interface HealthComponent {
  status: HealthComponentStatus;
}

export interface HealthDocument {
  status: HealthComponentStatus;
  components: {
    scheduler: HealthComponent;
    extraction: HealthComponent;
    disk: HealthComponent;
    mail: HealthComponent;
  };
  /** Insecure opt-in flags currently on (ADR 0018) — empty when none are. */
  insecureFlags: string[];
}

const STATUS_SEVERITY: Record<HealthComponentStatus, number> = {
  ok: 0,
  unknown: 1,
  degraded: 2,
  down: 3,
};

function worstOf(statuses: HealthComponentStatus[]): HealthComponentStatus {
  return statuses.reduce((worst, status) =>
    STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst,
  );
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(transportConfig.KEY) private readonly transport: ConfigType<typeof transportConfig>,
    @Inject(smtpConfig.KEY) private readonly smtp: ConfigType<typeof smtpConfig>,
  ) {}

  check(): HealthDocument {
    const components: HealthDocument["components"] = {
      scheduler: { status: "unknown" },
      extraction: { status: "unknown" },
      disk: { status: "unknown" },
      mail: { status: "unknown" },
    };

    return {
      status: worstOf(Object.values(components).map((component) => component.status)),
      components,
      insecureFlags: activeInsecureFlags(this.transport, this.smtp),
    };
  }
}
