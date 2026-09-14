import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import th from "../messages/th.json";

const THAI_CHAR = /[฀-๿]/;

// Keys allowed to hold a th.json value with no Thai characters — the
// telephone number, "DDS", and email addresses (§16.3, §17.1). Matched by
// key, not by value: matching by value would silently stop covering any
// later key whose value happens to equal one already listed here (e.g. a
// new key copy-pasting this same placeholder telephone number for a field
// that should have been translated).
const EXEMPT_KEYS = new Set<string>([
  // requester_service_telephone (#63) — a placeholder pending the real DDC
  // service number; digits carry no Thai characters either way.
  "requester_service_telephone",
]);

function messageKeys(catalog: Record<string, unknown>): string[] {
  return Object.keys(catalog).filter((key) => key !== "$schema");
}

describe("copy catalogue (§17.1)", () => {
  it("has identical key sets in en.json and th.json", () => {
    expect(messageKeys(th).sort()).toEqual(messageKeys(en).sort());
  });

  it("has Thai text in every th.json value, except the checked-in exemptions", () => {
    for (const key of messageKeys(th)) {
      if (EXEMPT_KEYS.has(key)) continue;
      const value = (th as Record<string, unknown>)[key];
      if (typeof value !== "string") continue;
      expect(
        THAI_CHAR.test(value),
        `messages/th.json["${key}"] = ${JSON.stringify(value)} has no Thai characters`,
      ).toBe(true);
    }
  });
});
