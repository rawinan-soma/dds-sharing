/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadRetentionNotice } from '../src/cli/retention-notice';
import { runReviewerCli, type CliIo } from '../src/cli/reviewer-cli';
import {
  validatePassword,
  verifyPassword,
} from '../src/reviewer/password-policy';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

const notice = loadRetentionNotice();
const messages = JSON.parse(
  readFileSync(join(__dirname, '../../../messages/en.json'), 'utf-8'),
) as Record<string, string>;

function fakeIo(answers: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const io: CliIo = {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    prompt: (question) => {
      asked.push(question);
      return Promise.resolve(answers.shift() ?? '');
    },
  };
  return { io, out, err, asked, text: () => out.join('\n') };
}

describe('the reviewer host commands', () => {
  let scratch: ScratchDatabase;
  let pool: Pool;
  let accounts: ReviewerAccounts;
  const confirm = (username: string) =>
    scratch.owner.query(
      'UPDATE reviewer SET totp_confirmed_at = now() WHERE username = $1',
      [username],
    );

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    pool = new Pool({ connectionString: scratch.appUrl });
    // DROP ... WITH (FORCE) can reach a connection that is still closing.
    pool.on('error', () => {});
    accounts = new ReviewerAccounts(drizzle(pool), {
      now: () => new Date(),
    });
  });

  afterAll(async () => {
    await pool.end();
    await scratch.drop();
  });

  describe('seed', () => {
    it("prompts for the person's real name rather than deriving it, then prints the ceremony", async () => {
      const cli = fakeIo(['Somchai Jaidee']);

      const code = await runReviewerCli(
        ['seed', '--username', 'somchai', '--email', 'somchai@example.go.th'],
        cli.io,
        accounts,
        notice,
      );

      expect(code).toBe(0);
      expect(cli.asked).toHaveLength(1);
      expect(cli.asked[0]).toMatch(/real name/i);
      expect(cli.asked[0]).toMatch(
        /permanent|cannot be changed|every decision/i,
      );

      const row = (
        await scratch.owner.query(
          `SELECT * FROM reviewer WHERE username = 'somchai'`,
        )
      ).rows[0];
      expect(row.display_name).toBe('Somchai Jaidee');

      // The password is printed once, and is the one that was hashed.
      const printed = /Password: (\S+)/.exec(cli.text());
      expect(printed).not.toBeNull();
      const password = printed![1];
      expect(validatePassword(password)).toEqual([]);
      expect(await verifyPassword(row.password_hash, password)).toBe(true);
      expect(cli.text().split(password)).toHaveLength(2);
    });

    it('prints a terminal QR for the TOTP secret', async () => {
      const cli = fakeIo(['Malee Rakdee']);
      await runReviewerCli(
        ['seed', '--username', 'malee', '--email', 'malee@example.go.th'],
        cli.io,
        accounts,
        notice,
      );
      // A terminal QR is drawn in block characters.
      expect(cli.text()).toMatch(/[█▀▄]{4,}/);
      const secret = (
        await scratch.owner.query(
          `SELECT totp_secret FROM reviewer WHERE username = 'malee'`,
        )
      ).rows[0].totp_secret;
      expect(cli.text()).toContain(secret);
    });

    it('prints what is recorded, and that it is permanent, from the catalogue', async () => {
      const cli = fakeIo(['Prasert Sukjai']);
      await runReviewerCli(
        ['seed', '--username', 'prasert', '--email', 'prasert@example.go.th'],
        cli.io,
        accounts,
        notice,
      );
      for (const key of [
        'reviewer_retention_heading',
        'reviewer_retention_signins',
        'reviewer_retention_response_times',
        'reviewer_retention_alerts',
        'reviewer_retention_display_name',
        'reviewer_retention_permanent',
      ]) {
        expect(cli.text()).toContain(messages[key]);
      }
      // Spelled out, so a reworded catalogue cannot quietly drop a promise.
      const text = cli.text();
      expect(text).toMatch(/IP address/);
      expect(text).toMatch(/24 business hour/);
      expect(text).toMatch(/display name/);
      expect(text).toMatch(/indefinitely/);
    });

    it('refuses a blank display name and writes nothing', async () => {
      const cli = fakeIo(['   ']);
      const code = await runReviewerCli(
        ['seed', '--username', 'blank', '--email', 'blank@example.go.th'],
        cli.io,
        accounts,
        notice,
      );
      expect(code).toBe(1);
      expect(cli.err.join('\n')).toMatch(/display name/i);
      const { rowCount } = await scratch.owner.query(
        `SELECT 1 FROM reviewer WHERE username = 'blank'`,
      );
      expect(rowCount).toBe(0);
    });

    it('reports a taken username without printing a password', async () => {
      const cli = fakeIo(['Somchai Again']);
      const code = await runReviewerCli(
        ['seed', '--username', 'somchai', '--email', 'again@example.go.th'],
        cli.io,
        accounts,
        notice,
      );
      expect(code).toBe(1);
      expect(cli.err.join('\n')).toMatch(/already exists/);
      expect(cli.text()).not.toMatch(/Password:/);
    });

    it('takes no operator: the flag does not exist', async () => {
      const cli = fakeIo(['Some One']);
      const code = await runReviewerCli(
        [
          'seed',
          '--username',
          'operatorcase',
          '--email',
          'o@example.go.th',
          '--operator',
          'Somebody',
        ],
        cli.io,
        accounts,
        notice,
      );
      expect(code).toBe(1);
      const { rowCount } = await scratch.owner.query(
        `SELECT 1 FROM reviewer WHERE username = 'operatorcase'`,
      );
      expect(rowCount).toBe(0);
    });

    it('needs a username and an email', async () => {
      const cli = fakeIo();
      expect(await runReviewerCli(['seed'], cli.io, accounts, notice)).toBe(1);
      expect(cli.err.join('\n')).toMatch(/--username/);
    });
  });

  describe('deactivate', () => {
    it('refuses to go below two active Reviewers, and says how to override', async () => {
      await confirm('somchai');
      await confirm('malee');
      const cli = fakeIo();

      const code = await runReviewerCli(
        ['deactivate', 'malee'],
        cli.io,
        accounts,
        notice,
      );

      expect(code).toBe(1);
      expect(cli.err.join('\n')).toMatch(/two/i);
      expect(cli.err.join('\n')).toContain('--force');
      const { rows } = await scratch.owner.query(
        `SELECT deactivated_at FROM reviewer WHERE username = 'malee'`,
      );
      expect(rows[0].deactivated_at).toBeNull();
    });

    it('with --force prints what it is breaking, then deactivates', async () => {
      const cli = fakeIo();

      const code = await runReviewerCli(
        ['deactivate', 'malee', '--force'],
        cli.io,
        accounts,
        notice,
      );

      expect(code).toBe(0);
      const text = cli.text();
      expect(text).toMatch(/fewer than two|below two/i);
      expect(text).toMatch(/recovery/i);
      expect(text).toMatch(/expire/i);
      const { rows } = await scratch.owner.query(
        `SELECT deactivated_at FROM reviewer WHERE username = 'malee'`,
      );
      expect(rows[0].deactivated_at).not.toBeNull();
      const event = (
        await scratch.owner.query(
          `SELECT payload FROM reviewer_event WHERE type = 'deactivated'`,
        )
      ).rows[0];
      expect(event.payload).toEqual({ force: true });
    });

    it('reports an unknown Reviewer', async () => {
      const cli = fakeIo();
      expect(
        await runReviewerCli(
          ['deactivate', 'ghost', '--force'],
          cli.io,
          accounts,
          notice,
        ),
      ).toBe(1);
      expect(cli.err.join('\n')).toMatch(/no reviewer/i);
    });

    it('takes no operator: the flag does not exist', async () => {
      const cli = fakeIo();
      expect(
        await runReviewerCli(
          ['deactivate', 'somchai', '--force', '--operator', 'X'],
          cli.io,
          accounts,
          notice,
        ),
      ).toBe(1);
    });
  });

  describe('unknown commands', () => {
    it('prints usage and fails', async () => {
      const cli = fakeIo();
      expect(await runReviewerCli(['explode'], cli.io, accounts, notice)).toBe(
        1,
      );
      expect(cli.err.join('\n')).toMatch(/usage/i);
    });
  });
});

// ADR 0020: a host command names no one. The absence of the flag is tested above;
// this is the other half, that nothing in the host-command code reaches for an
// operator by environment variable or login name either.
describe('host commands read no operator name (ADR 0020)', () => {
  const files = [
    ...readdirSync(join(__dirname, '../src/cli')).map((f) =>
      join(__dirname, '../src/cli', f),
    ),
    join(__dirname, '../src/reviewer/reviewer-accounts.ts'),
  ];

  it.each(files)('%s', (file) => {
    const source = readFileSync(file, 'utf-8');
    expect(source).not.toMatch(/userInfo|os\.hostname|\.username\b.*os/);
    expect(source).not.toMatch(
      /process\.env\.(USER|USERNAME|LOGNAME|SUDO_USER|OPERATOR)/i,
    );
    expect(source).not.toMatch(/['"`]--operator/);
    expect(source).not.toMatch(/operator\s*[:=]/i);
  });
});
