import { describe, it, expect } from "vitest";
import { DISEASE_GROUPS } from "./disease-groups.js";

describe("DISEASE_GROUPS", () => {
  it("has exactly ten groups", () => {
    expect(DISEASE_GROUPS).toHaveLength(10);
  });

  it("gives every group a stable id distinct from its Thai name", () => {
    for (const group of DISEASE_GROUPS) {
      expect(group.id).not.toBe(group.nameTh);
      expect(group.id.length).toBeGreaterThan(0);
    }
  });

  it("has no two groups sharing an id", () => {
    const ids = DISEASE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every group at least one Report code", () => {
    for (const group of DISEASE_GROUPS) {
      expect(group.reportCodes.length).toBeGreaterThan(0);
    }
  });
});
