export type HealthStatus = 'healthy' | 'warn' | 'unhealthy';

export interface ComponentHealth {
  status: HealthStatus;
  [detail: string]: unknown;
}

export interface HealthDocument {
  status: Extract<HealthStatus, 'healthy' | 'unhealthy'>;
  components: {
    scheduler: ComponentHealth;
    extraction: ComponentHealth;
    disk: ComponentHealth;
    mail: ComponentHealth;
  };
}
