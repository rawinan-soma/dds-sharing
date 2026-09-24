import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { appConfig } from '../config/namespaces';
import { type InsecureFlagName, InsecureFlags } from '../config/insecure-flags';
import { DB, type Db } from '../db/database.module';
import { extractionHealth } from '../extraction/extraction-health';
import { mailHealth } from '../mail/mail-health';
import { CLOCK, type Clock } from '../clock/clock';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { schedulerHealth } from '../scheduler/scheduler-health';
import { type ComponentHealth } from './component-health';
import { diskHealth, type MeasureVolume } from './disk-health';

// The single source of truth for which components the health document names.
// Specs should read this list rather than re-typing the four names.
export const HEALTH_COMPONENT_NAMES = [
  'scheduler',
  'extraction',
  'disk',
  'mail',
] as const;

/** Injects the `MeasureVolume` the `disk` component uses; replaced in specs. */
export const VOLUME_USAGE = Symbol('VOLUME_USAGE');

export type HealthStatus = ComponentHealth['status'];

export type HealthDocument = {
  /** The worst component's status — the operator-facing summary (spec §11.3, §15.3). */
  status: HealthStatus;
  components: Record<(typeof HEALTH_COMPONENT_NAMES)[number], ComponentHealth>;
  /** The insecure flags that are on; empty when the deployment is secure. */
  insecureFlags: InsecureFlagName[];
};

const SEVERITY: Record<HealthStatus, number> = { ok: 0, warn: 1, degraded: 2 };

/**
 * One `/health` document (spec §14.1). Statuses only — never counts, never
 * Request data: each component's reason is a fixed phrase, because this
 * document is unauthenticated.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly flags: InsecureFlags,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly provinces: ProvinceLookup,
    @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
    @Inject(VOLUME_USAGE) private readonly measureVolume: MeasureVolume,
  ) {}

  async check(): Promise<HealthDocument> {
    const components = {
      // The same fact the Reviewer-queue banner reads (spec §15.3).
      scheduler: await schedulerHealth(
        this.db,
        this.clock.now(),
        this.provinces.checksum,
      ),
      extraction: await extractionHealth(this.db),
      // The scratch volume: the one the app can see that the other stores share.
      disk: await diskHealth(this.app.scratchDir, this.measureVolume),
      mail: await mailHealth(this.db),
    };
    const status = Object.values(components)
      .map((c) => c.status)
      .reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst), 'ok');

    return { status, components, insecureFlags: [...this.flags.active] };
  }
}
