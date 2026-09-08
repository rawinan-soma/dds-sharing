import { describe, it, expect } from "vitest";
import en from "../messages/en.json";
import th from "../messages/th.json";

const THAI_CHAR = /[฀-๿]/;

// Values allowed to hold no Thai characters — the telephone number, "DDS",
// and email addresses (§16.3, §17.1). Empty until a ticket introduces one.
const EXEMPT_VALUES: string[] = [];

function messageKeys(catalog: Record<string, unknown>): string[] {
  return Object.keys(catalog).filter((key) => key !== "$schema");
}

describe("copy catalogue (§17.1)", () => {
  it("has identical key sets in en.json and th.json", () => {
    expect(messageKeys(th).sort()).toEqual(messageKeys(en).sort());
  });

  it("has Thai text in every th.json value, except the checked-in exemptions", () => {
    for (const key of messageKeys(th)) {
      const value = (th as Record<string, unknown>)[key];
      if (typeof value !== "string" || EXEMPT_VALUES.includes(value)) continue;
      expect(
        THAI_CHAR.test(value),
        `messages/th.json["${key}"] = ${JSON.stringify(value)} has no Thai characters`,
      ).toBe(true);
    }
  });
});
