import { pathToFileURL } from "node:url";
import { userInfo } from "node:os";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.js";
import { createDb } from "../src/db/client.js";
import { findReviewerByUsername, deactivateReviewer, countOtherActiveReviewers, isActive } from "../src/auth/reviewer.repository.js";
import { deleteAllSessionsForReviewer } from "../src/auth/session.repository.js";
import { recordReviewerEvent } from "../src/auth/reviewer-event-writer.js";

// The minimum is two *reachable* Reviewers, not two rows in a table (spec
// §17.5) — the second Reviewer is the entire recovery story for a lost TOTP
// device, since there are no recovery codes and no email reset.
export const MINIMUM_ACTIVE_REVIEWERS = 2;

export interface DeactivateReviewerInput {
  username: string;
  operator: string;
  force: boolean;
}

export type DeactivateReviewerResult =
  | { outcome: "deactivated" }
  | { outcome: "already_deactivated" }
  | { outcome: "not_found" }
  | { outcome: "refused_below_minimum"; remainingActive: number };

export async function deactivateReviewerCli(
  db: NodePgDatabase<typeof schema>,
  input: DeactivateReviewerInput,
): Promise<DeactivateReviewerResult> {
  const reviewer = await findReviewerByUsername(db, input.username);
  if (!reviewer) return { outcome: "not_found" };
  if (!isActive(reviewer)) return { outcome: "already_deactivated" };

  const remainingActive = await countOtherActiveReviewers(db, reviewer.id);
  if (!input.force && remainingActive < MINIMUM_ACTIVE_REVIEWERS) {
    return { outcome: "refused_below_minimum", remainingActive };
  }

  await deactivateReviewer(db, reviewer.id);
  // Deactivation invalidates live sessions immediately (spec §17.5) — a Postgres query, not a wait for the session to expire on its own.
  await deleteAllSessionsForReviewer(db, reviewer.id);
  await recordReviewerEvent(db, reviewer.id, { type: "deactivated", payload: { operator: input.operator, force: input.force } });

  return { outcome: "deactivated" };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const username = args.find((arg) => !arg.startsWith("--"));
  const operator = process.env.REVIEWER_CLI_OPERATOR || userInfo().username;

  if (!username) {
    console.error("Usage: reviewer-deactivate <username> [--force]");
    process.exitCode = 1;
    return;
  }

  const { db, pool } = createDb(process.env.DATABASE_URL);
  try {
    const result = await deactivateReviewerCli(db, { username, operator, force });

    switch (result.outcome) {
      case "not_found":
        console.error(`No Reviewer named "${username}".`);
        process.exitCode = 1;
        break;
      case "already_deactivated":
        console.log(`"${username}" is already deactivated.`);
        break;
      case "refused_below_minimum":
        console.error(
          `Refused: deactivating "${username}" would leave only ${result.remainingActive} active Reviewer(s), ` +
            `below the minimum of ${MINIMUM_ACTIVE_REVIEWERS}. There would be no recovery path for a lost TOTP device. ` +
            `Re-run with --force to proceed anyway.`,
        );
        process.exitCode = 1;
        break;
      case "deactivated":
        console.log(
          `"${username}" deactivated${force ? " (forced below the minimum of " + MINIMUM_ACTIVE_REVIEWERS + " active Reviewers)" : ""}. ` +
            "All of their live sessions were invalidated immediately. The account and its history are kept, never deleted.",
        );
        break;
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
