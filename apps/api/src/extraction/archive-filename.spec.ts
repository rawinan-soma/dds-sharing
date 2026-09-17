import { describe, expect, it } from "vitest";
import { buildArchiveNames } from "./archive-filename.js";

describe("buildArchiveNames (spec §8.3)", () => {
  it("names the archive and CSV from the submit moment in Asia/Bangkok", () => {
    // 2026-03-04T10:15:30Z is 2026-03-04T17:15:30+07:00 in Bangkok.
    const submittedAt = new Date("2026-03-04T10:15:30Z");
    const names = buildArchiveNames(submittedAt, 1);
    expect(names.archiveFilename).toBe("dds-envocc-sharing-20260304-171530.zip");
    expect(names.csvFilename).toBe("dds-envocc-sharing-20260304-171530.csv");
  });

  it("crosses the UTC day boundary correctly (UTC late evening -> next day in Bangkok)", () => {
    // 2026-01-01T18:00:00Z is 2026-01-02T01:00:00+07:00 in Bangkok.
    const submittedAt = new Date("2026-01-01T18:00:00Z");
    const names = buildArchiveNames(submittedAt, 1);
    expect(names.archiveFilename).toBe("dds-envocc-sharing-20260102-010000.zip");
  });

  it("carries no suffix for the first run", () => {
    const names = buildArchiveNames(new Date("2026-03-04T10:15:30Z"), 1);
    expect(names.archiveFilename).not.toMatch(/-r\d+\.zip$/);
  });

  it("a Re-run's runNumber appends -rN to both filenames (spec §8.3, FR-26)", () => {
    const names = buildArchiveNames(new Date("2026-03-04T10:15:30Z"), 2);
    expect(names.archiveFilename).toBe("dds-envocc-sharing-20260304-171530-r2.zip");
    expect(names.csvFilename).toBe("dds-envocc-sharing-20260304-171530-r2.csv");

    const thirdRun = buildArchiveNames(new Date("2026-03-04T10:15:30Z"), 3);
    expect(thirdRun.archiveFilename).toBe("dds-envocc-sharing-20260304-171530-r3.zip");
  });

  it("carries no reference number", () => {
    const names = buildArchiveNames(new Date("2026-03-04T10:15:30Z"), 1);
    expect(names.archiveFilename).not.toMatch(/REQ|[A-Z]{2,}-\d+/);
  });

  it("rejects a non-positive or non-integer runNumber", () => {
    const submittedAt = new Date("2026-03-04T10:15:30Z");
    expect(() => buildArchiveNames(submittedAt, 0)).toThrow();
    expect(() => buildArchiveNames(submittedAt, 1.5)).toThrow();
  });
});
