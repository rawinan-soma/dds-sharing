import { parseArgs } from 'node:util';
import QRCode from 'qrcode';
import { type CliIo, isArgumentError } from './cli-io';
import {
  MIN_ACTIVE_REVIEWERS,
  type ReviewerAccounts,
  ReviewerInputError,
} from '../reviewer/reviewer-accounts';

export type { CliIo } from './cli-io';

const USAGE = `Usage:
  reviewer seed --username <name> --email <address>
      Seeds a named Reviewer. Prompts for their real name.
  reviewer deactivate <username> [--force]
      Deactivates a Reviewer. Refuses to leave fewer than two active
      Reviewers unless --force is given.
  reviewer reset-password <username>
      Prints a new password once and forces a change at the next sign-in.
      Ends their live sessions. There is no email reset: this is the path.
  reviewer reenrol-totp <username>
      Prints a new authenticator QR. The account is inert until one code
      from it confirms the enrolment. Ends their live sessions.`;

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
    if (command === 'reset-password')
      return await resetPassword(rest, io, accounts);
    if (command === 'reenrol-totp')
      return await reenrolTotp(rest, io, accounts);
  } catch (error) {
    if (error instanceof ReviewerInputError) {
      io.err(error.message);
      return 1;
    }
    if (isArgumentError(error)) {
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

  io.out(`Reviewer "${values.username}" seeded.`);
  io.out('');
  io.out(
    'Give the Reviewer this password now. It is shown once and cannot be shown again.',
  );
  io.out(`Password: ${seeded.password}`);
  io.out('');
  await printEnrolment(io, seeded);
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

async function printEnrolment(
  io: CliIo,
  enrolment: { enrolmentUri: string; totpSecret: string },
): Promise<void> {
  const qr = await QRCode.toString(enrolment.enrolmentUri, {
    type: 'terminal',
    small: true,
  });
  io.out('Have them scan this with Google Authenticator:');
  io.out(qr);
  io.out(
    `If the QR will not scan, type this key in by hand: ${enrolment.totpSecret}`,
  );
}

function oneUsername(args: string[], io: CliIo): string | null {
  const { positionals } = parseArgs({
    args,
    options: {},
    allowPositionals: true,
    strict: true,
  });
  if (positionals.length !== 1) {
    io.err('Give exactly one username.');
    io.err(USAGE);
    return null;
  }
  return positionals[0];
}

function refused(
  io: CliIo,
  username: string,
  status: 'not_found' | 'deactivated',
): number {
  io.err(
    status === 'not_found'
      ? `No Reviewer named "${username}".`
      : `"${username}" is deactivated, and a deactivated account stays deactivated. Seed a new one instead.`,
  );
  return 1;
}

async function resetPassword(
  args: string[],
  io: CliIo,
  accounts: ReviewerAccounts,
): Promise<number> {
  const username = oneUsername(args, io);
  if (username === null) return 1;
  const outcome = await accounts.resetPassword(username);
  if (outcome.status !== 'reset') return refused(io, username, outcome.status);

  io.out(
    `Password for "${username}" reset; ${outcome.sessionsEnded} live session(s) ended.`,
  );
  io.out('');
  io.out(
    'Give the Reviewer this password now. It is shown once and cannot be shown again.',
  );
  io.out(`Password: ${outcome.password}`);
  io.out('');
  io.out(
    'Their next sign-in, with their existing authenticator, makes them choose a new password.',
  );
  return 0;
}

async function reenrolTotp(
  args: string[],
  io: CliIo,
  accounts: ReviewerAccounts,
): Promise<number> {
  const username = oneUsername(args, io);
  if (username === null) return 1;
  const outcome = await accounts.reenrolTotp(username);
  if (outcome.status !== 're_enrolled') {
    return refused(io, username, outcome.status);
  }

  io.out(
    `Authenticator for "${username}" replaced; ${outcome.sessionsEnded} live session(s) ended. Codes from the old one no longer work.`,
  );
  io.out('');
  await printEnrolment(io, outcome);
  io.out('');
  io.out(
    'The account is inert until they sign in once with a code from this enrolment. Their password is unchanged.',
  );
  return 0;
}
