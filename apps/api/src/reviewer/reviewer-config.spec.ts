import { describe, expect, it } from 'vitest';
import { reviewerConfigFromEnv } from './reviewer-config';

describe('the Reviewer cookie flag (§10.5)', () => {
  it('is Secure by default', () => {
    expect(reviewerConfigFromEnv({}).secureCookies).toBe(true);
  });

  it('is switched off only by the explicit development flag', () => {
    expect(
      reviewerConfigFromEnv({ REVIEWER_INSECURE_COOKIE: 'true' }).secureCookies,
    ).toBe(false);
  });

  it.each(['', '1', 'yes', 'TRUE', 'false', 'ture'])(
    'stays Secure for the value %j: nothing degrades it silently',
    (value) => {
      expect(
        reviewerConfigFromEnv({ REVIEWER_INSECURE_COOKIE: value })
          .secureCookies,
      ).toBe(true);
    },
  );
});
