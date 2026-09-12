import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password-hash.js";

describe("password hashing (spec §17.5: argon2id)", () => {
  it("hashes as argon2id", async () => {
    const hash = await hashPassword("Abcdefg1!234");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the original password against its hash", async () => {
    const hash = await hashPassword("Abcdefg1!234");
    await expect(verifyPassword(hash, "Abcdefg1!234")).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Abcdefg1!234");
    await expect(verifyPassword(hash, "wrong-password")).resolves.toBe(false);
  });

  it("salts independently, so the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([hashPassword("Abcdefg1!234"), hashPassword("Abcdefg1!234")]);
    expect(a).not.toBe(b);
  });
});
