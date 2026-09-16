import { describe, expect, it } from "vitest";
import { EXTRACT_COLUMNS } from "./allowlist.js";
import { buildProvinceLookup } from "./epidem-health-zone.js";
import { newProjectionCounters, projectRow } from "./project.js";

const provinces = buildProvinceLookup([{ provinceId: "10", healthRegion: 4 }]);
const NOW = new Date("2026-06-15T00:00:00.000Z");

describe("projectRow", () => {
  it("emits exactly the fixed 23 columns, in order", () => {
    const counters = newProjectionCounters();
    const projected = projectRow({}, "201", provinces, counters, NOW);
    expect(Object.keys(projected)).toEqual([...EXTRACT_COLUMNS]);
  });

  it("copies a known upstream field straight through", () => {
    const counters = newProjectionCounters();
    const projected = projectRow(
      { gender: "M", hospital_code: "10660" },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(projected.gender).toBe("M");
    expect(projected.hospital_code).toBe("10660");
  });

  it("emits an empty cell (null) for a missing upstream key", () => {
    const counters = newProjectionCounters();
    const projected = projectRow({}, "201", provinces, counters, NOW);
    expect(projected.gender).toBeNull();
  });

  it("column 2 is the Report code the row was fetched under, never a response field", () => {
    const counters = newProjectionCounters();
    const projected = projectRow(
      { epidem_report_group_code: "999" },
      "214",
      provinces,
      counters,
      NOW,
    );
    expect(projected.epidem_report_group_code).toBe("214");
  });

  it("derives onset_age and counts impossible inputs", () => {
    const counters = newProjectionCounters();
    const projected = projectRow(
      { birth_date: "2000-01-01", onset_date: "2020-01-01" },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(projected.onset_age).toBe(20);
    expect(counters.impossibleDerivationInputs).toBe(0);

    const impossible = projectRow(
      { birth_date: "2020-01-01", onset_date: "2000-01-01" },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(impossible.onset_age).toBeNull();
    expect(counters.impossibleDerivationInputs).toBe(1);
  });

  it("derives epidem_health_zone and counts an unmapped code separately from impossible age inputs", () => {
    const counters = newProjectionCounters();
    const ok = projectRow(
      { epidem_chw_code: "10" },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(ok.epidem_health_zone).toBe(4);

    const unmapped = projectRow(
      { epidem_chw_code: "99" },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(unmapped.epidem_health_zone).toBeNull();
    expect(counters.unmappedHealthZoneCount).toBe(1);
    expect(counters.impossibleDerivationInputs).toBe(0);
  });

  it("raises the unknown-field alert for a name never catalogued, and never for an absent one", () => {
    const counters = newProjectionCounters();
    projectRow(
      { gender: "M", some_new_upstream_field: "x" },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(counters.unknownFieldNames.has("some_new_upstream_field")).toBe(
      true,
    );
    expect(counters.unknownFieldNames.has("gender")).toBe(false);
  });

  it("never alerts on a field this codebase has catalogued as dropped", () => {
    const counters = newProjectionCounters();
    projectRow(
      { cid: "encrypted", location_gis_latitude: 13.7 },
      "201",
      provinces,
      counters,
      NOW,
    );
    expect(counters.unknownFieldNames.size).toBe(0);
  });
});
