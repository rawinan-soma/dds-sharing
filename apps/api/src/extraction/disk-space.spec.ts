import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkFreeDisk } from "./disk-space.js";

describe("checkFreeDisk", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dds-sharing-disk-check-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports free bytes and stays above a floor of zero", async () => {
    const result = await checkFreeDisk(dir, 0);
    expect(result.freeBytes).toBeGreaterThan(0);
    expect(result.belowFloor).toBe(false);
  });

  it("reports below the floor when the floor exceeds actual free space", async () => {
    const result = await checkFreeDisk(dir, Number.MAX_SAFE_INTEGER);
    expect(result.belowFloor).toBe(true);
  });

  it("creates the directory if it does not yet exist", async () => {
    const missing = join(dir, "nested", "scratch");
    const result = await checkFreeDisk(missing, 0);
    expect(result.belowFloor).toBe(false);
  });
});
