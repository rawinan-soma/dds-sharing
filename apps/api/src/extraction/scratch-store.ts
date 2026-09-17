import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectedRow } from "./project.js";

/**
 * Where a job's per-code checkpoints live (spec §7.6, §7.8). The same
 * filesystem the disk-floor check inspects — a container's `/tmp` is
 * ordinarily on the same volume as everything else the floor is meant to
 * protect (PostgreSQL, logs, images), so checking there answers the right
 * question without a dedicated bind mount.
 */
export const SCRATCH_ROOT = join(tmpdir(), "dds-sharing-extraction-scratch");

function codeCheckpointPath(scratchRoot: string, requestId: string, reportCode: string): string {
  return join(scratchRoot, requestId, `${reportCode}.json`);
}

/**
 * Only post-allowlist output ever touches disk (spec §7.1) — every write
 * here takes already-projected rows, never a raw upstream row.
 */
export class ScratchStore {
  constructor(private readonly root: string = SCRATCH_ROOT) {}

  async hasCheckpoint(requestId: string, reportCode: string): Promise<boolean> {
    try {
      await readFile(codeCheckpointPath(this.root, requestId, reportCode));
      return true;
    } catch {
      return false;
    }
  }

  async readCheckpoint(
    requestId: string,
    reportCode: string,
  ): Promise<ProjectedRow[]> {
    const raw = await readFile(
      codeCheckpointPath(this.root, requestId, reportCode),
      "utf8",
    );
    return JSON.parse(raw) as ProjectedRow[];
  }

  /**
   * A completed code's projected rows, persisted so a job resuming after a
   * worker restart redoes at most the code that was in flight (§7.6).
   */
  async writeCheckpoint(
    requestId: string,
    reportCode: string,
    rows: readonly ProjectedRow[],
  ): Promise<void> {
    const path = codeCheckpointPath(this.root, requestId, reportCode);
    await mkdir(join(this.root, requestId), { recursive: true });
    await writeFile(path, JSON.stringify(rows));
  }

  /**
   * Every checkpoint for one Request's job. Called by `ExtractionProcessor`
   * once the archive has uploaded successfully (§7.8: "exactly one copy
   * exists after completion"). A Re-run (#74) will need the same clean
   * slate rather than a stale prior attempt's partial checkpoints — a
   * failed job is never auto-retried (FR-13), so that call site does not
   * exist yet.
   */
  async clear(requestId: string): Promise<void> {
    await rm(join(this.root, requestId), { recursive: true, force: true });
  }
}
