import { Injectable } from '@nestjs/common';

// The single source of truth for which components the health document names.
// Later tickets give each one real thresholds; specs should read this list
// rather than re-typing the four names.
export const HEALTH_COMPONENT_NAMES = [
  'scheduler',
  'extraction',
  'disk',
  'mail',
] as const;

export interface ComponentHealth {
  status: 'ok';
}

export type HealthDocument = {
  status: 'ok';
  components: Record<(typeof HEALTH_COMPONENT_NAMES)[number], ComponentHealth>;
};

@Injectable()
export class HealthService {
  check(): HealthDocument {
    const stub: ComponentHealth = { status: 'ok' };
    const components = Object.fromEntries(
      HEALTH_COMPONENT_NAMES.map((name) => [name, stub]),
    ) as HealthDocument['components'];

    return { status: 'ok', components };
  }
}
