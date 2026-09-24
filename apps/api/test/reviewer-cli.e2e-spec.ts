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

  describe('reset-password', () => {
    const sessionsOf = async (username: string) =>
      (
        await scratch.owner.query(
          `SELECT 1 FROM reviewer_session s JOIN reviewer r ON r.id = s.reviewer_id
           WHERE r.username = $1`,
          [username],
        )
      ).rowCount;
    const openSession = (username: string) =>
      scratch.owner.query(
        `INSERT INTO reviewer_session (reviewer_id, token_hash, created_at, last_seen_at)
         SELECT id, md5(random()::text), now(), now()
         FROM reviewer WHERE username = $1`,
        [username],
      );

    it('prints a new password once, forces a change at next sign-in and ends live sessions', async () => {
      await scratch.owner.query(
        `UPDATE reviewer SET must_change_password = false WHERE username = 'somchai'`,
      );
      await openSession('somchai');
      const before = (
        await scratch.owner.query(
          `SELECT password_hash, totp_secret FROM reviewer WHERE username = 'somchai'`,
        )
      ).rows[0];
      const cli = fakeIo();

      const code = await runReviewerCli(
        ['reset-password', 'somchai'],
        cli.io,
        accounts,
        notice,
      );

      expect(code).toBe(0);
      const row = (
        await scratch.owner.query(
          `SELECT * FROM reviewer WHERE username = 'somchai'`,
        )
      ).rows[0];
      const printed = /Password: (\S+)/.exec(cli.text());
      expect(printed).not.toBeNull();
      const password = printed![1];
      expect(validatePassword(password)).toEqual([]);
      expect(row.password_hash).not.toBe(before.password_hash);
      expect(await verifyPassword(row.password_hash, password)).toBe(true);
      expect(cli.text().split(password)).toHaveLength(2);
      expect(row.must_change_password).toBe(true);
      // A password reset leaves the authenticator alone.
      expect(row.totp_secret).toBe(before.totp_secret);
      expect(row.totp_confirmed_at).not.toBeNull();
      expect(await sessionsOf('somchai')).toBe(0);
      expect(cli.text()).toMatch(/1 live session/);
      // Recorded the moment it runs, naming the account and nobody else.
      const events = (
        await scratch.owner.query(
          `SELECT actor_type, reviewer_id, payload FROM reviewer_event WHERE type = 'password_reset'`,
        )
      ).rows;
      expect(events).toEqual([
        {
          actor_type: 'system',
          reviewer_id: null,
          payload: { username: 'somchai', sessionsEnded: 1 },
        },
      ]);
    });

    it('refuses a deactivated Reviewer', async () => {
      const cli = fakeIo();
      expect(
        await runReviewerCli(
          ['reset-password', 'malee'],
          cli.io,
          accounts,
          notice,
        ),
      ).toBe(1);
      expect(cli.err.join('\n')).toMatch(/deactivated/);
      expect(cli.text()).not.toMatch(/Password:/);
      const { rowCount } = await scratch.owner.query(
        `SELECT 1 FROM reviewer_event WHERE type = 'password_reset' AND payload->>'username' = 'malee'`,
      );
      expect(rowCount).toBe(0);
    });

    it('reports an unknown Reviewer', async () => {
      const cli = fakeIo();
      expect(
        await runReviewerCli(
          ['reset-password', 'ghost'],
          cli.io,
          accounts,
          notice,
        ),
      ).toBe(1);
      expect(cli.err.join('\n')).toMatch(/no reviewer/i);
    });
  });

  describe('reenrol-totp', () => {
    it('prints a new QR and key, makes the account inert until a code confirms it, and ends live sessions', async () => {
      await scratch.owner.query(
        `UPDATE reviewer SET totp_last_used_step = 123 WHERE username = 'somchai'`,
      );
      await scratch.owner.query(
        `INSERT INTO reviewer_session (reviewer_id, token_hash, created_at, last_seen_at)
         SELECT id, md5(random()::text), now(), now()
         FROM reviewer WHERE username = 'somchai'`,
      );
      const before = (
        await scratch.owner.query(
          `SELECT password_hash, totp_secret, must_change_password FROM reviewer WHERE username = 'somchai'`,
        )
      ).rows[0];
      const cli = fakeIo();

      const code = await runReviewerCli(
        ['reenrol-totp', 'somchai'],
        cli.io,
        accounts,
        notice,
      );

      expect(code).toBe(0);
      const row = (
        await scratch.owner.query(
          `SELECT * FROM reviewer WHERE username = 'somchai'`,
        )
      ).rows[0];
      expect(row.totp_secret).not.toBe(before.totp_secret);
      expect(cli.text()).toContain(row.totp_secret);
      expect(cli.text()).toMatch(/[█▀▄]{4,}/);
      expect(row.totp_confirmed_at).toBeNull();
      expect(row.totp_last_used_step).toBeNull();
      // The password is not touched, and none is printed.
      expect(row.password_hash).toBe(before.password_hash);
      expect(row.must_change_password).toBe(before.must_change_password);
      expect(cli.text()).not.toMatch(/Password:/);
      const { rowCount } = await scratch.owner.query(
        `SELECT 1 FROM reviewer_session WHERE reviewer_id = $1`,
        [row.id],
      );
      expect(rowCount).toBe(0);
      expect(cli.text()).toMatch(/inert/);
      const events = (
        await scratch.owner.query(
          `SELECT actor_type, reviewer_id, payload FROM reviewer_event WHERE type = 'totp_reset'`,
        )
      ).rows;
      expect(events).toEqual([
        {
          actor_type: 'system',
          reviewer_id: null,
          payload: { username: 'somchai', sessionsEnded: 1 },
        },
      ]);
    });

    it('refuses a deactivated Reviewer', async () => {
      const cli = fakeIo();
      expect(
        await runReviewerCli(
          ['reenrol-totp', 'malee'],
          cli.io,
          accounts,
          notice,
        ),
      ).toBe(1);
      expect(cli.err.join('\n')).toMatch(/deactivated/);
    });

    it('needs exactly one username', async () => {
      const cli = fakeIo();
      expect(
        await runReviewerCli(['reenrol-totp'], cli.io, accounts, notice),
      ).toBe(1);
      expect(cli.err.join('\n')).toMatch(/usage/i);
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
