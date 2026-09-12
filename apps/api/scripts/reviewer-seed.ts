import { pathToFileURL } from "node:url";
import { userInfo } from "node:os";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import QRCode from "qrcode";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.js";
import { createDb } from "../src/db/client.js";
import { hashPassword } from "../src/auth/password-hash.js";
import { generateCompliantPassword } from "../src/auth/password-policy.js";
import { generateTotpSecret, totpProvisioningUri } from "../src/auth/totp.js";
import { insertReviewer } from "../src/auth/reviewer.repository.js";
import { recordReviewerEvent } from "../src/auth/reviewer-event-writer.js";
import { REVIEWER_RETENTION_NOTICE } from "../src/auth/retention-notice.js";

export interface SeedReviewerInput {
  username: string;
  displayName: string;
  email?: string;
  operator: string;
}

export interface SeedReviewerResult {
  reviewerId: string;
  username: string;
  displayName: string;
  password: string;
  provisioningUri: string;
}

/**
 * The seeding ceremony's core (spec §17.5): generates a compliant password
 * and a TOTP secret, inserts the Reviewer as inert (`totp_confirmed_at`
 * null, `must_change_password` true — both `insertReviewer`'s defaults), and
 * records `seeded`. Printing the password, the QR and the retention notice
 * is the caller's job — this function returns exactly what it needs to.
 */
export async function seedReviewer(
  db: NodePgDatabase<typeof schema>,
  input: SeedReviewerInput,
): Promise<SeedReviewerResult> {
  const password = generateCompliantPassword();
  const passwordHash = await hashPassword(password);
  const secret = generateTotpSecret();

  const reviewer = await insertReviewer(db, {
    username: input.username,
    displayName: input.displayName,
    email: input.email ?? null,
    passwordHash,
    totpSecret: secret.base32,
  });

  await recordReviewerEvent(db, reviewer.id, { type: "seeded", payload: { operator: input.operator } });

  return {
    reviewerId: reviewer.id,
    username: reviewer.username,
    displayName: reviewer.displayName,
    password,
    provisioningUri: totpProvisioningUri(reviewer.username, secret),
  };
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const username = process.argv[2] || (await rl.question("Username: "));
    const displayName =
      process.argv[3] || (await rl.question("Display name (the Reviewer's real name — never derived from the username): "));
    const emailAnswer = process.argv[4] ?? (await rl.question("Email (optional, queue notification only — press enter to skip): "));
    const operator = process.env.REVIEWER_CLI_OPERATOR || userInfo().username;

    const { db, pool } = createDb(process.env.DATABASE_URL);
    try {
      const result = await seedReviewer(db, {
        username,
        displayName,
        email: emailAnswer || undefined,
        operator,
      });

      console.log(`\nReviewer "${result.username}" (${result.displayName}) seeded.\n`);
      console.log(`One-time password (shown once — record it now):\n  ${result.password}\n`);
      console.log("Scan this into Google Authenticator:\n");
      console.log(await QRCode.toString(result.provisioningUri, { type: "terminal", small: true }));
      console.log(`\n${REVIEWER_RETENTION_NOTICE}\n`);
      console.log(
        "This account is inert until its first sign-in confirms TOTP enrolment, which also forces an immediate password change.",
      );
    } finally {
      await pool.end();
    }
  } finally {
    rl.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
