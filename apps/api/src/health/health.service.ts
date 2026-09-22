import { Injectable } from '@nestjs/common';
import { type InsecureFlagName, InsecureFlags } from '../config/insecure-flags';

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
  /** The insecure flags that are on; empty when the deployment is secure. */
  insecureFlags: InsecureFlagName[];
};

@Injectable()
export class HealthService {
  constructor(private readonly flags: InsecureFlags) {}

  check(): HealthDocument {
    const stub: ComponentHealth = { status: 'ok' };
    const components = Object.fromEntries(
      HEALTH_COMPONENT_NAMES.map((name) => [name, stub]),
    ) as HealthDocument['components'];

    return { status: 'ok', components, insecureFlags: [...this.flags.active] };
  }
}
