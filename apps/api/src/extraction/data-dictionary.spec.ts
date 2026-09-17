import { describe, expect, it } from "vitest";
import { EXTRACT_COLUMNS } from "./allowlist.js";
import {
  computeDataDictionaryChecksum,
  DATA_DICTIONARY_FILENAME,
  getDataDictionaryBytes,
} from "./data-dictionary.js";
import { DISEASE_GROUPS } from "../reference-data/disease-groups.js";

describe("Data dictionary (spec §8.2 rule 8)", () => {
  it("has a fixed filename", () => {
    expect(DATA_DICTIONARY_FILENAME).toBe("data-dictionary.csv");
  });

  it("carries every one of the 23 Extract columns", () => {
    const text = getDataDictionaryBytes().toString("utf8");
    for (const column of EXTRACT_COLUMNS) {
      expect(text).toContain(column);
    }
  });

  it("carries the Disease group classification — every group id and its Report codes", () => {
    const text = getDataDictionaryBytes().toString("utf8");
    for (const group of DISEASE_GROUPS) {
      expect(text).toContain(group.id);
      for (const code of group.reportCodes) {
        expect(text).toContain(code);
      }
    }
  });

  it("notes the BOM for pandas readers", () => {
    const text = getDataDictionaryBytes().toString("utf8");
    expect(text.toLowerCase()).toContain("utf-8-sig");
  });

  it("is identical on every read — a build artefact, never generated per Request", () => {
    const first = getDataDictionaryBytes();
    const second = getDataDictionaryBytes();
    expect(first.equals(second)).toBe(true);
  });

  it("computeDataDictionaryChecksum is deterministic", () => {
    expect(computeDataDictionaryChecksum()).toBe(computeDataDictionaryChecksum());
  });
});
