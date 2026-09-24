import { describe, expect, it } from 'vitest';
import { extractionStatus } from './extraction-health';

// Most recent first, as `extractionHealth` reads them.
describe('extractionStatus', () => {
  it('is ok with no finished job yet', () => {
    expect(extractionStatus([])).toEqual({ status: 'ok' });
  });

  it('is ok after one failure: one failure is a Requester’s problem', () => {
    expect(extractionStatus(['failed'])).toEqual({ status: 'ok' });
    expect(extractionStatus(['failed', 'succeeded'])).toEqual({ status: 'ok' });
  });

  it('is degraded after two consecutive failures: two is an outage', () => {
    expect(extractionStatus(['failed', 'failed'])).toMatchObject({
      status: 'degraded',
    });
  });

  it('resets on a success', () => {
    expect(extractionStatus(['succeeded', 'failed'])).toEqual({
      status: 'ok',
    });
  });

  it('never carries a count in its reason', () => {
    expect(JSON.stringify(extractionStatus(['failed', 'failed']))).not.toMatch(
      /\d/,
    );
  });
});
