import { describe, it, expect } from "vitest";
import { backoffSeconds, THROTTLE_CAP_SECONDS } from "./throttle-backoff.js";

describe("backoffSeconds (spec §17.5: exponential, capped near 30s, no lockout)", () => {
  it("grows exponentially with the failure count", () => {
    expect(backoffSeconds(0)).toBe(1);
    expect(backoffSeconds(1)).toBe(2);
    expect(backoffSeconds(2)).toBe(4);
    expect(backoffSeconds(3)).toBe(8);
    expect(backoffSeconds(4)).toBe(16);
  });

  it("caps at 30 seconds and never grows past it, however many failures pile up", () => {
    expect(backoffSeconds(5)).toBe(THROTTLE_CAP_SECONDS);
    expect(backoffSeconds(50)).toBe(THROTTLE_CAP_SECONDS);
  });

  it("is always finite and positive — there is no lockout state", () => {
    for (const n of [0, 1, 10, 1000]) {
      expect(Number.isFinite(backoffSeconds(n))).toBe(true);
      expect(backoffSeconds(n)).toBeGreaterThan(0);
    }
  });
});
