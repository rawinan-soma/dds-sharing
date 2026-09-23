import { Inject, Injectable } from '@nestjs/common';
import { type InsecureFlagName, InsecureFlags } from '../config/insecure-flags';
import { DB, type Db } from '../db/database.module';
import { mailHealth } from '../mail/mail-health';

// The single source of truth for which components the health document names.
// Later tickets give each one real thresholds; specs should read this list
// rather than re-typing the four names.
export const HEALTH_COMPONENT_NAMES = [
  'scheduler',
  'extraction',
  'disk',
  'mail',
] as const;

export type ComponentHealth =
  { status: 'ok' } | { status: 'degraded'; reason: string };

export type HealthDocument = {
  /** `degraded` whenever any component is — the operator-facing summary (spec §11.3, §15.3). */
  status: 'ok' | 'degraded';
  components: Record<(typeof HEALTH_COMPONENT_NAMES)[number], ComponentHealth>;
  /** The insecure flags that are on; empty when the deployment is secure. */
  insecureFlags: InsecureFlagName[];
};

@Injectable()
export class HealthService {
  constructor(
    private readonly flags: InsecureFlags,
    @Inject(DB) private readonly db: Db,
  ) {}

  async check(): Promise<HealthDocument> {
    const stub: ComponentHealth = { status: 'ok' };
    const components = {
      scheduler: stub,
      extraction: stub,
      disk: stub,
      // The one real check this ticket adds (spec §11.3's operator banner);
      // the other three stay stubbed until #75.
      mail: await mailHealth(this.db),
    };
    const status = Object.values(components).some(
      (c) => c.status === 'degraded',
    )
      ? 'degraded'
      : 'ok';

    return { status, components, insecureFlags: [...this.flags.active] };
  }
}
