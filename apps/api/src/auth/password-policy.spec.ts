import { describe, it, expect } from "vitest";
import {
  checkPasswordPolicy,
  isPasswordCompliant,
  generateCompliantPassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "./password-policy.js";

describe("checkPasswordPolicy (spec §17.5)", () => {
  it("accepts a password that meets every rule", () => {
    expect(checkPasswordPolicy("Abcdefg1!234")).toEqual([]);
  });

  it("rejects a password shorter than 12 characters", () => {
    expect(checkPasswordPolicy("Ab1!fgh")).toContain("too_short");
  });

  it("rejects a password longer than 20 characters, deliberately — the ceiling is the binding constraint", () => {
    const tooLong = "Ab1!" + "x".repeat(20);
    expect(checkPasswordPolicy(tooLong)).toContain("too_long");
  });

  it("accepts exactly at the floor and the ceiling", () => {
    expect(checkPasswordPolicy("Ab1!aaaaaaaa")).toEqual([]); // 12
    expect(checkPasswordPolicy("Ab1!aaaaaaaaaaaaaaaa")).toEqual([]); // 20
  });

  it("rejects a password with no uppercase letter", () => {
    expect(checkPasswordPolicy("abcdefg1!234")).toContain("missing_uppercase");
  });

  it("rejects a password with no digit", () => {
    expect(checkPasswordPolicy("Abcdefgh!zyx")).toContain("missing_digit");
  });

  it("rejects a password with no special character", () => {
    expect(checkPasswordPolicy("Abcdefgh1234")).toContain("missing_special");
  });

  it("reports every violation at once, not just the first", () => {
    expect(checkPasswordPolicy("abc")).toEqual(
      expect.arrayContaining(["too_short", "missing_uppercase", "missing_digit", "missing_special"]),
    );
  });
});

describe("isPasswordCompliant", () => {
  it("is true iff there are no violations", () => {
    expect(isPasswordCompliant("Abcdefg1!234")).toBe(true);
    expect(isPasswordCompliant("short")).toBe(false);
  });
});

describe("generateCompliantPassword", () => {
  it("always produces a policy-compliant password", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateCompliantPassword();
      expect(checkPasswordPolicy(password)).toEqual([]);
    }
  });

  it("defaults to the maximum length", () => {
    expect(generateCompliantPassword()).toHaveLength(PASSWORD_MAX_LENGTH);
  });

  it("honours an explicit in-range length", () => {
    expect(generateCompliantPassword(PASSWORD_MIN_LENGTH)).toHaveLength(PASSWORD_MIN_LENGTH);
  });

  it("refuses a length outside the policy's own range", () => {
    expect(() => generateCompliantPassword(PASSWORD_MIN_LENGTH - 1)).toThrow();
    expect(() => generateCompliantPassword(PASSWORD_MAX_LENGTH + 1)).toThrow();
  });

  it("does not repeat the same password across calls", () => {
    const passwords = new Set(Array.from({ length: 20 }, () => generateCompliantPassword()));
    expect(passwords.size).toBe(20);
  });
});
