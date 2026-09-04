export type ComponentStatus = 'healthy' | 'warn' | 'unhealthy';

export interface ComponentHealth {
  status: ComponentStatus;
  detail?: string;
}

export interface HealthDocument {
  status: ComponentStatus;
  components: {
    scheduler: ComponentHealth;
    extraction: ComponentHealth;
    disk: ComponentHealth;
    mail: ComponentHealth;
  };
}
