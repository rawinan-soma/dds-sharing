import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { appConfig } from '../config/namespaces';
import { InsecureFlagName, InsecureFlags } from '../config/insecure-flags';
import { DB } from '../db/database.module';
import { extractionJob, mailDelivery, schedulerHeartbeat } from '../db/schema';
import { CLOCK } from '../clock/clock';
import { ProvinceLookup } from '../reference/province-lookup.service';
import { type VolumeUsage } from './disk-health';
import { HealthController } from './health.controller';
import {
  HEALTH_COMPONENT_NAMES,
  type HealthDocument,
  HealthService,
  VOLUME_USAGE,
} from './health.service';

const NOW = new Date('2026-09-21T03:00:00Z');

interface World {
  failingMail?: readonly { kind: string }[];
  beatAt?: Date | null;
  /** Finished jobs, most recent first. */
  finishedJobs?: readonly ('succeeded' | 'failed')[];
  usedFraction?: number;
}

// Answers the reads `check()` makes: the heartbeat (fresh unless told
// otherwise), the overdue-object count, the stale-province probe, the last
// finished jobs and the unresolved `mail_delivery` rows. Each component's own
// rules are its own spec's job; this file only needs the document's shape
// and the status code it travels with.
function fakeDb(world: World) {
  const rowsFor = (table: unknown, selected: Record<string, unknown>) => {
    if (table === schedulerHeartbeat) {
      const beatAt = world.beatAt === undefined ? NOW : world.beatAt;
      return beatAt ? [{ beatAt }] : [];
    }
    if (table === mailDelivery) return world.failingMail ?? [];
    if (table === extractionJob) {
      if ('one' in selected) return [];
      return (world.finishedJobs ?? []).map((status) => ({ status }));
    }
    return [{ overdue: 0 }];
  };
  return {
    select: (selected: Record<string, unknown> = {}) => ({
      from: (table: unknown) => {
        const rows = Promise.resolve(rowsFor(table, selected));
        const chain: object = Object.assign(rows, {
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
        });
        return chain;
      },
    }),
  };
}

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function serve(world: World = {}, active: InsecureFlagName[] = []) {
  const usage = (): Promise<VolumeUsage> =>
    Promise.resolve({
      totalBytes: 100,
      availableBytes: 100 * (1 - (world.usedFraction ?? 0.2)),
    });
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      HealthService,
      { provide: InsecureFlags, useValue: { active } },
      { provide: DB, useValue: fakeDb(world) },
      { provide: CLOCK, useValue: { now: () => NOW } },
      { provide: ProvinceLookup, useValue: { checksum: 'abc' } },
      { provide: appConfig.KEY, useValue: { scratchDir: '/scratch' } },
      { provide: VOLUME_USAGE, useValue: usage },
    ],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  const http = request(app.getHttpServer());
  return {
    get: async (path: string) => {
      const res = await http.get(path);
      return { status: res.status, body: res.body as HealthDocument };
    },
  };
}

describe('/health', () => {
  it('names all four components, and is 200 when all are ok', async () => {
    const res = await (await serve()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(Object.keys(res.body.components).sort()).toEqual(
      [...HEALTH_COMPONENT_NAMES].sort(),
    );
  });

  it('serves the same document at /health/scheduler', async () => {
    const http = await serve({ beatAt: null });
    const health = await http.get('/health');
    const alias = await http.get('/health/scheduler');

    expect(alias.status).toBe(health.status);
    expect(alias.body).toEqual(health.body);
  });

  it.each([
    ['scheduler', { beatAt: null }],
    ['extraction', { finishedJobs: ['failed', 'failed'] }],
    ['disk', { usedFraction: 0.95 }],
    ['mail', { failingMail: [{ kind: 'delivery' }, { kind: 'rejection' }] }],
  ] as const)(
    'is non-200 with the component named when %s is degraded',
    async (name, world) => {
      const res = await (await serve(world)).get('/health');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.components[name].status).toBe('degraded');
      for (const other of HEALTH_COMPONENT_NAMES.filter((n) => n !== name)) {
        expect(res.body.components[other].status).toBe('ok');
      }
    },
  );

  it('stays 200 on a disk warning, and says so in the body', async () => {
    const res = await (await serve({ usedFraction: 0.8 })).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('warn');
    expect(res.body.components.disk.status).toBe('warn');
  });

  it('carries statuses only: no counts and no identifiers, even when everything is red', async () => {
    const res = await (
      await serve({
        beatAt: null,
        finishedJobs: ['failed', 'failed'],
        usedFraction: 0.97,
        failingMail: [
          { kind: 'delivery' },
          { kind: 'rejection' },
          { kind: 'queue_notification' },
        ],
      })
    ).get('/health');

    expect(JSON.stringify(res.body.components)).not.toMatch(/\d/);
  });

  it('reports no insecure flags when both are off', async () => {
    const res = await (await serve()).get('/health');
    expect(res.body.insecureFlags).toEqual([]);
  });

  it('names each insecure flag that is on', async () => {
    const res = await (
      await serve({}, ['ALLOW_INSECURE_TRANSPORT', 'SMTP_ALLOW_PLAINTEXT'])
    ).get('/health');
    expect(res.body.insecureFlags).toEqual([
      'ALLOW_INSECURE_TRANSPORT',
      'SMTP_ALLOW_PLAINTEXT',
    ]);
  });
});
