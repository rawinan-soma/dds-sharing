import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from './with-timeout';

describe('withTimeout', () => {
  it('passes a settled result straight through', async () => {
    await expect(withTimeout(Promise.resolve(7), 1_000, 'stat')).resolves.toBe(
      7,
    );
  });

  it('fails a call that hangs, naming it, instead of waiting for ever', async () => {
    vi.useFakeTimers();
    try {
      const hung = withTimeout(new Promise(() => {}), 30_000, 'minio remove');
      vi.advanceTimersByTime(30_000);
      await expect(hung).rejects.toThrow(
        'minio remove timed out after 30000ms',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
