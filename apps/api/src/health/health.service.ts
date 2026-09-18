import { Injectable } from '@nestjs/common';

export interface ComponentHealth {
  status: 'ok';
}

export interface HealthDocument {
  status: 'ok';
  components: {
    scheduler: ComponentHealth;
    extraction: ComponentHealth;
    disk: ComponentHealth;
    mail: ComponentHealth;
  };
}

@Injectable()
export class HealthService {
  check(): HealthDocument {
    const stub: ComponentHealth = { status: 'ok' };
    return {
      status: 'ok',
      components: {
        scheduler: stub,
        extraction: stub,
        disk: stub,
        mail: stub,
      },
    };
  }
}
