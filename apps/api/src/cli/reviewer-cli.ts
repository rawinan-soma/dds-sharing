import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
import {
  MIN_ACTIVE_REVIEWERS,
  type ReviewerAccounts,
  ReviewerInputError,
} from '../reviewer/reviewer-accounts';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  prompt(question: string): Promise<string>;
}

const USAGE = `Usage:
  reviewer seed --username <name> --email <address>
      Seeds a named Reviewer. Prompts for their real name.
  reviewer deactivate <username> [--force]
      Deactivates a Reviewer. Refuses to leave fewer than two active
      Reviewers unless --force is given.`;

/** What a Reviewer is told at seeding: the same words first login shows. */
export type RetentionNotice = string[];

// Host commands name no one (ADR 0020): there is no operator argument, no
// environment variable read for one and no login name looked up. Shell access
// to the Docker host is the bar.
export async function runReviewerCli(
  argv: string[],
  io: CliIo,
  accounts: ReviewerAccounts,
  notice: RetentionNotice,
): Promise<number> {
  const [command, ...rest] = argv;
  try {
    if (command === 'seed') return await seed(rest, io, accounts, notice);
    if (command === 'deactivate') return await deactivate(rest, io, accounts);
  } catch (error) {
    if (error instanceof ReviewerInputError) {
      io.err(error.message);
      return 1;
    }
    // Unknown flags, missing values: parseArgs's own messages are readable.
    if (error instanceof TypeError && 'code' in error) {
      io.err(error.message);
      io.err(USAGE);
      return 1;
    }
    throw error;
  }
  io.err(USAGE);
  return 1;
}

async function seed(
  args: string[],
  io: CliIo,
  accounts: ReviewerAccounts,
  notice: RetentionNotice,
): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      username: { type: 'string' },
      email: { type: 'string' },
    },
    strict: true,
  });
  if (!values.username) {
    io.err('--username is required.');
    return 1;
  }
  if (!values.email) {
    io.err('--email is required (queue notification only, never for reset).');
    return 1;
  }

  // Asked, never derived from the username: it is unerasable, so it must be
  // typed on purpose.
  const displayName = (
    await io.prompt(
      "Display name — the person's real name. It stays on every Decision they make, permanently, and cannot be changed later: ",
    )
  ).trim();

  const seeded = await accounts.seed({
    username: values.username,
    displayName,
    email: values.email,
  });

  const qr = await QRCode.toString(seeded.enrolmentUri, {
    type: 'terminal',
    small: true,
  });
  io.out(`Reviewer "${values.username}" seeded.`);
  io.out('');
  io.out(
    'Give the Reviewer this password now. It is shown once and cannot be shown again.',
  );
  io.out(`Password: ${seeded.password}`);
  io.out('');
  io.out('Have them scan this with Google Authenticator:');
  io.out(qr);
  io.out(
    `If the QR will not scan, type this key in by hand: ${seeded.totpSecret}`,
  );
  io.out('');
  io.out(
    'The account is inert until they sign in once with a code, and their first sign-in makes them choose a new password.',
  );
  io.out('');
  for (const line of notice) io.out(line);
  return 0;
}

async function deactivate(
  args: string[],
  io: CliIo,
  accounts: ReviewerAccounts,
): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: { force: { type: 'boolean', default: false } },
    allowPositionals: true,
    strict: true,
  });
  const [username, ...extra] = positionals;
  if (!username || extra.length > 0) {
    io.err('Give exactly one username.');
    io.err(USAGE);
    return 1;
  }

  const outcome = await accounts.deactivate(username, {
    force: values.force === true,
  });
  switch (outcome.status) {
    case 'not_found':
      io.err(`No Reviewer named "${username}".`);
      return 1;
    case 'already_deactivated':
      io.err(`"${username}" is already deactivated.`);
      return 1;
    case 'refused_floor':
      io.err(
        `Refused: that would leave ${outcome.activeAfter} active Reviewer(s), fewer than two. The service needs ${MIN_ACTIVE_REVIEWERS} reachable people.`,
      );
      io.err(
        "The second Reviewer is the first one's only recovery path, and requests expire while nobody can decide them.",
      );
      io.err('To do it anyway, run again with --force.');
      return 1;
    case 'deactivated':
      if (outcome.forcedBelowFloor) {
        io.out(
          `WARNING: --force took the service below two active Reviewers. With fewer than two, a lost authenticator has no recovery path but this host, and Requests expire while no one can decide them.`,
        );
      }
      io.out(
        `"${username}" is deactivated; ${outcome.sessionsEnded} live session(s) ended. Their name stays on every Decision they made.`,
      );
      return 0;
  }
}
