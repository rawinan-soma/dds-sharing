import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScratchStore } from "./scratch-store.js";
import type { ProjectedRow } from "./project.js";

describe("ScratchStore", () => {
  let root: string;
  let store: ScratchStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "dds-sharing-scratch-store-"));
    store = new ScratchStore(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("has no checkpoint for a code that was never written", async () => {
    expect(await store.hasCheckpoint("req-1", "201")).toBe(false);
  });

  it("round-trips a completed code's projected rows", async () => {
    const rows = [{ gender: "M" }, { gender: "F" }] as unknown as ProjectedRow[];
    await store.writeCheckpoint("req-1", "201", rows);

    expect(await store.hasCheckpoint("req-1", "201")).toBe(true);
    expect(await store.readCheckpoint("req-1", "201")).toEqual(rows);
  });

  it("keeps two Report codes of one Request apart", async () => {
    await store.writeCheckpoint("req-1", "201", [{ a: 1 } as unknown as ProjectedRow]);
    await store.writeCheckpoint("req-1", "202", [{ a: 2 } as unknown as ProjectedRow]);

    expect(await store.readCheckpoint("req-1", "201")).toEqual([{ a: 1 }]);
    expect(await store.readCheckpoint("req-1", "202")).toEqual([{ a: 2 }]);
  });

  it("keeps two Requests apart", async () => {
    await store.writeCheckpoint("req-1", "201", [{ a: 1 } as unknown as ProjectedRow]);
    await store.writeCheckpoint("req-2", "201", [{ a: 2 } as unknown as ProjectedRow]);

    expect(await store.readCheckpoint("req-1", "201")).toEqual([{ a: 1 }]);
    expect(await store.readCheckpoint("req-2", "201")).toEqual([{ a: 2 }]);
  });

  it("clears every checkpoint for a Request", async () => {
    await store.writeCheckpoint("req-1", "201", [{ a: 1 } as unknown as ProjectedRow]);
    await store.clear("req-1");
    expect(await store.hasCheckpoint("req-1", "201")).toBe(false);
  });

  it("clearing a Request with no checkpoints is a no-op", async () => {
    await expect(store.clear("never-written")).resolves.toBeUndefined();
  });
});
