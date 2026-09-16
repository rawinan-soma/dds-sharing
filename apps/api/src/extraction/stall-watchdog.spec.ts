import { describe, expect, it, vi } from "vitest";
import { StallError, raceAgainstStall } from "./stall-watchdog.js";

describe("raceAgainstStall", () => {
  it("resolves with the work's value when it settles before the timeout", async () => {
    const result = await raceAgainstStall(() => Promise.resolve("done"), 50);
    expect(result).toBe("done");
  });

  it("propagates the work's own rejection unchanged", async () => {
    const error = new Error("upstream failed");
    await expect(
      raceAgainstStall(() => Promise.reject(error), 50),
    ).rejects.toBe(error);
  });

  it("rejects with StallError when the work never settles within the timeout", async () => {
    vi.useFakeTimers();
    try {
      const neverSettles = new Promise<never>(() => {});
      const promise = raceAgainstStall(() => neverSettles, 1000);
      const assertion = expect(promise).rejects.toBeInstanceOf(StallError);
      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
