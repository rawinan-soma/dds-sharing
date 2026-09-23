import { describe, expect, it } from 'vitest';
import { DOWNLOAD_TOKEN_LIFETIME_HOURS } from '../delivery/download-tokens.repository';
import {
  EXTRACT_BACKSTOP,
  EXTRACT_BACKSTOP_DAYS,
  prepareExtractBucket,
} from './bucket-lifecycle';

function fakeClient(exists: boolean) {
  const calls: string[] = [];
  let lifecycle: unknown;
  return {
    calls,
    lifecycle: () => lifecycle,
    bucketExists: () => Promise.resolve(exists),
    makeBucket: (bucket: string) => {
      calls.push(`make ${bucket}`);
      return Promise.resolve();
    },
    setBucketLifecycle: (bucket: string, config: unknown) => {
      calls.push(`lifecycle ${bucket}`);
      lifecycle = config;
      return Promise.resolve();
    },
  };
}

describe('the lifecycle backstop (spec §9.5)', () => {
  it('never expires an object before its Download token does', () => {
    expect(EXTRACT_BACKSTOP_DAYS * 24).toBeGreaterThanOrEqual(
      DOWNLOAD_TOKEN_LIFETIME_HOURS,
    );
  });

  it('is expressed in whole days, measured from object creation — nothing finer', () => {
    const [rule] = EXTRACT_BACKSTOP.Rule;
    expect(rule.Expiration).toEqual({ Days: EXTRACT_BACKSTOP_DAYS });
    expect(rule.Status).toBe('Enabled');
  });

  it('applies the rule to the bucket, creating the bucket if it is missing', async () => {
    const client = fakeClient(false);
    await prepareExtractBucket(client, 'dds-extracts');
    expect(client.calls).toEqual([
      'make dds-extracts',
      'lifecycle dds-extracts',
    ]);
    expect(client.lifecycle()).toEqual(EXTRACT_BACKSTOP);
  });

  it('leaves an existing bucket in place', async () => {
    const client = fakeClient(true);
    await prepareExtractBucket(client, 'dds-extracts');
    expect(client.calls).toEqual(['lifecycle dds-extracts']);
  });
});
