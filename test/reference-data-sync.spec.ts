import { describe, it, expect } from "vitest";
import { DISEASE_GROUPS as API_DISEASE_GROUPS } from "../apps/api/src/reference-data/disease-groups.js";
import { PROVINCE_SEED_META } from "../apps/api/src/reference-data/province-seed.generated.js";
import { computeProvinceChecksum } from "../apps/api/src/reference-data/province-integrity.js";
import { DISEASE_GROUPS as WEB_DISEASE_GROUPS } from "../apps/web/src/app/reference-data/disease-groups.js";
import { PROVINCES as WEB_PROVINCES } from "../apps/web/src/app/reference-data/provinces.js";

// apps/web embeds its own copy of these two fixed seeds (spec §16.1: no
// per-request server data on the form) rather than fetching them from the
// api at runtime. Nothing else checks the two copies agree, so this is that
// check — without it, a seed change applied to one side only would ship
// silently: the web picker would offer (or omit) a group id the server's
// validateSubmitRequest disagrees with, or a stale province name/health
// region.
describe("web reference-data copies match the api's (§16.1)", () => {
  it("has the same Disease group ids, in the same order, as apps/api's seed", () => {
    expect(WEB_DISEASE_GROUPS.map((g) => g.id)).toEqual(
      API_DISEASE_GROUPS.map((g) => g.id),
    );
  });

  it("has the same Thai name for every Disease group id as apps/api's seed", () => {
    for (const group of API_DISEASE_GROUPS) {
      const webGroup = WEB_DISEASE_GROUPS.find((g) => g.id === group.id);
      expect(
        webGroup?.nameTh,
        `web copy is missing or disagrees on "${group.id}"`,
      ).toBe(group.nameTh);
    }
  });

  it("has a province table whose checksum matches the seeded docs/provinces.csv checksum", () => {
    const checksum = computeProvinceChecksum(
      WEB_PROVINCES.map((p) => ({ ...p })),
    );
    expect(WEB_PROVINCES).toHaveLength(PROVINCE_SEED_META.rowCount);
    expect(checksum).toBe(PROVINCE_SEED_META.checksum);
  });
});
