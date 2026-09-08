import { Injectable } from "@nestjs/common";

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
    };
  }
}
