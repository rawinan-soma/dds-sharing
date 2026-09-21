/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import {
  validatePassword,
  verifyPassword,
} from '../src/reviewer/password-policy';
import { verifyTotp } from '../src/reviewer/totp';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// The seeding and deactivation ceremonies, against a real database reached as
// the application role, so a grant the code needs but the role lacks fails here.
describe('reviewer accounts (host commands)', () => {
  let scratch: ScratchDatabase;
  let app: Pool;
  let accounts: ReviewerAccounts;
  const now = new Date('2026-09-21T02:00:00Z');

  const events = async (type?: string) =>
    (
      await scratch.owner.query(
        `SELECT * FROM reviewer_event ${type ? `WHERE type = '${type}'` : ''} ORDER BY id`,
      )
    ).rows;
  const reviewerRow = async (username: string) =>
    (
      await scratch.owner.query('SELECT * FROM reviewer WHERE username = $1', [
        username,
      ])
    ).rows[0];

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    app = new Pool({ connectionString: scratch.appUrl });
    // DROP ... WITH (FORCE) can reach a connection that is still closing.
    app.on('error', () => {});
    accounts = new ReviewerAccounts(drizzle(app), { now: () => now });
  });

  afterAll(async () => {
    await app.end();
    await scratch.drop();
  });

  describe('seeding', () => {
    it('creates an inert account and returns a compliant one-time password and a TOTP URI', async () => {
      const seeded = await accounts.seed({
        username: 'somchai',
        displayName: 'Somchai Jaidee',
        email: 'somchai@example.go.th',
      });

      expect(validatePassword(seeded.password)).toEqual([]);
      const uri = new URL(seeded.enrolmentUri);
      expect(uri.searchParams.get('secret')).toBe(seeded.totpSecret);

      const row = await reviewerRow('somchai');
      expect(row.display_name).toBe('Somchai Jaidee');
      expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(await verifyPassword(row.password_hash, seeded.password)).toBe(
        true,
      );
      // Inert until one code confirms enrolment; first login forces a change.
      expect(row.totp_confirmed_at).toBeNull();
      expect(row.must_change_password).toBe(true);
      expect(row.deactivated_at).toBeNull();
      // The stored secret is the one the QR carries.
      expect(row.totp_secret).toBe(seeded.totpSecret);
      expect(
        verifyTotp(row.totp_secret, '000000', now.getTime(), null).ok,
      ).toBe(false);
    });

    it('writes a `seeded` event naming no operator', async () => {
      const [event] = await events('seeded');
      const row = await reviewerRow('somchai');

      expect(event.actor_type).toBe('system');
      expect(event.reviewer_id).toBeNull();
      expect(event.payload).toEqual({
        reviewerId: row.id,
        username: 'somchai',
      });
      expect(event.occurred_at).toEqual(now);
    });

    it('rejects a duplicate username, and a malformed one, without writing an event', async () => {
      const before = (await events('seeded')).length;
      await expect(
        accounts.seed({
          username: 'somchai',
          displayName: 'Someone Else',
          email: 'x@example.go.th',
        }),
      ).rejects.toThrow(/already/i);
      await expect(
        accounts.seed({
          username: 'Not Valid!',
          displayName: 'Someone Else',
          email: 'x@example.go.th',
        }),
      ).rejects.toThrow(/username/i);
      expect((await events('seeded')).length).toBe(before);
    });

    it('refuses a blank display name rather than deriving one from the username', async () => {
      await expect(
        accounts.seed({
          username: 'blankname',
          displayName: '   ',
          email: 'x@example.go.th',
        }),
      ).rejects.toThrow(/display name/i);
      expect(await reviewerRow('blankname')).toBeUndefined();
    });

    it('cannot rewrite a display name once written: the application role has no such grant', async () => {
      await expect(
        app.query(`UPDATE reviewer SET display_name = 'Renamed'`),
      ).rejects.toThrow(/permission denied/);
      await expect(app.query(`DELETE FROM reviewer`)).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe('deactivation', () => {
    const confirm = (username: string) =>
      scratch.owner.query(
        'UPDATE reviewer SET totp_confirmed_at = now() WHERE username = $1',
        [username],
      );
    const seedConfirmed = async (username: string) => {
      await accounts.seed({
        username,
        displayName: `Name of ${username}`,
        email: `${username}@example.go.th`,
      });
      await confirm(username);
    };

    it('refuses to go below two active Reviewers, and changes nothing', async () => {
      await confirm('somchai');
      await seedConfirmed('malee');
      const before = await events('deactivated');

      const outcome = await accounts.deactivate('malee', { force: false });

      expect(outcome).toEqual({ status: 'refused_floor', activeAfter: 1 });
      expect((await reviewerRow('malee')).deactivated_at).toBeNull();
      expect(await events('deactivated')).toEqual(before);
    });

    it('lets a third Reviewer be deactivated without force, ending their sessions', async () => {
      await seedConfirmed('prasert');
      const reviewer = await reviewerRow('prasert');
      await scratch.owner.query(
        `INSERT INTO reviewer_session (token_hash, reviewer_id, created_at, last_seen_at)
         VALUES ('h1', $1, now(), now()), ('h2', $1, now(), now())`,
        [reviewer.id],
      );

      const outcome = await accounts.deactivate('prasert', { force: false });

      expect(outcome).toEqual({
        status: 'deactivated',
        forcedBelowFloor: false,
        sessionsEnded: 2,
      });
      const row = await reviewerRow('prasert');
      expect(row.deactivated_at).toEqual(now);
      const sessions = await scratch.owner.query(
        'SELECT 1 FROM reviewer_session WHERE reviewer_id = $1',
        [reviewer.id],
      );
      expect(sessions.rowCount).toBe(0);
    });

    it('records `deactivated` with the Reviewer and whether the floor was forced, and no operator', async () => {
      const [event] = await events('deactivated');
      const row = await reviewerRow('prasert');
      expect(event.actor_type).toBe('system');
      expect(event.payload).toEqual({
        reviewerId: row.id,
        forcedBelowFloor: false,
      });
    });

    it('goes below two only with force, and records that it did', async () => {
      const outcome = await accounts.deactivate('malee', { force: true });

      expect(outcome).toEqual({
        status: 'deactivated',
        forcedBelowFloor: true,
        sessionsEnded: 0,
      });
      const forced = (await events('deactivated')).at(-1);
      expect(forced.payload.forcedBelowFloor).toBe(true);
    });

    it('never deletes the row', async () => {
      const row = await reviewerRow('malee');
      expect(row.deactivated_at).not.toBeNull();
    });

    it('does not count an unconfirmed account as one of the two', async () => {
      // somchai is the only confirmed one left; the seeded-but-inert account
      // must not make deactivating them look safe.
      await accounts.seed({
        username: 'inert',
        displayName: 'Inert Person',
        email: 'inert@example.go.th',
      });
      const outcome = await accounts.deactivate('somchai', { force: false });
      expect(outcome).toEqual({ status: 'refused_floor', activeAfter: 0 });
    });

    it('reports an unknown or already deactivated account, and writes no event', async () => {
      const before = (await events('deactivated')).length;
      expect(await accounts.deactivate('nobody', { force: true })).toEqual({
        status: 'not_found',
      });
      expect(await accounts.deactivate('malee', { force: true })).toEqual({
        status: 'already_deactivated',
      });
      expect((await events('deactivated')).length).toBe(before);
    });
  });
});
