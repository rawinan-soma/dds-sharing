import { describe, it, expect } from "vitest";
import { DISEASE_GROUPS } from "../apps/api/src/reference-data/disease-groups.js";
import { REPORT_CODES } from "../apps/api/src/reference-data/report-codes.js";

// §17.1 required test: the classification in docs/disease-groups.md
// partitions the Report code seed in docs/research/003-disease-group-codes.md
// — every code sits in exactly one group, none is left out, none is
// repeated. Both files are embedded here as REPORT_CODES / DISEASE_GROUPS
// rather than parsed from Markdown at test time.
//
// ⚠️ Known blind spot (spec §4.9, §17.1): this test compares the
// classification against the *seed*, never against upstream. A Report code
// that exists upstream and is missing from the seed is structurally
// invisible to it — that gap is closed by a periodic human re-probe
// (docs/disease-groups.md, "Periodic upstream domain re-probe"), never by a
// build.
describe("Disease group classification (§17.1)", () => {
  it("covers every seeded Report code exactly once", () => {
    const allCodes = DISEASE_GROUPS.flatMap((group) => group.reportCodes);

    expect([...allCodes].sort()).toEqual([...REPORT_CODES].sort());
    expect(new Set(allCodes).size).toBe(allCodes.length);
  });

  it("does not assume the Report code set is contiguous or 24-valued", () => {
    expect(REPORT_CODES).toHaveLength(25);
    expect(REPORT_CODES).toContain("501");

    // 501 sits far outside 201-224 — the standing proof no code may assume a
    // contiguous range.
    const numeric = REPORT_CODES.map(Number);
    const contiguousRunLength = Math.max(...numeric) - Math.min(...numeric) + 1;
    expect(contiguousRunLength).toBeGreaterThan(numeric.length);
  });
});
