import argon2 from "argon2";

// argon2's own default is already argon2id, but that default is an
// implementation detail of the library, not of this spec (§17.5: "hashed
// with argon2id") — pinned explicitly so a future argon2 upgrade cannot
// change the algorithm silently.
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
