import { describe, expect, it } from 'vitest';
import { reviewerConfigFrom } from './reviewer-config';

describe('the Reviewer cookie flag (§10.5)', () => {
  it('is Secure when insecure transport is not allowed', () => {
    expect(
      reviewerConfigFrom({ allowInsecureTransport: false }).secureCookies,
    ).toBe(true);
  });

  it('is switched off only when the deployment allows insecure transport', () => {
    expect(
      reviewerConfigFrom({ allowInsecureTransport: true }).secureCookies,
    ).toBe(false);
  });
});
