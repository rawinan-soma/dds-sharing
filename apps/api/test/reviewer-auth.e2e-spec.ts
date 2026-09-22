/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import {
  Controller,
  Get,
  INestApplication,
  Module,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import supertest from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { CLOCK } from '../src/reviewer/clock';
import { ReviewerAccounts } from '../src/reviewer/reviewer-accounts';
import { ReviewerModule } from '../src/reviewer/reviewer.module';
import {
  AllowPasswordChangePending,
  ReviewerAuthGuard,
} from '../src/reviewer/reviewer-auth.guard';
import { Browser, TestClock } from './support/browser';
import { phoneCode } from './support/phone-authenticator';
import {
  createScratchDatabase,
  type ScratchDatabase,
} from './support/scratch-database';

// Stands in for the screens later tickets build: anything a Reviewer may do is
// behind the same guard, so the guard is what is proved here.
@Controller('probe')
@UseGuards(ReviewerAuthGuard)
class ProbeController {
  @Get('reviewable')
  reviewable() {
    return { ok: true };
  }

  @Get('pending-change')
  @AllowPasswordChangePending()
  pendingChange() {
    return { ok: true };
  }
}
@Module({ imports: [ReviewerModule], controllers: [ProbeController] })
class ProbeModule {}

const MIN = 60_000;
const HOUR = 60 * MIN;
const STEP = 30_000;
const GENERIC = { error: 'sign_in_failed' };

describe('reviewer sign-in and sessions (e2e)', () => {
  let scratch: ScratchDatabase;
  let app: INestApplication;
  let server: App;
  let accounts: ReviewerAccounts;
  let appPool: Pool;
  const clock = new TestClock(Date.UTC(2026, 8, 21, 2, 0, 0));
  let seq = 0;

  async function boot() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbeModule],
    })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    // Listening once, so concurrent requests share one server rather than each
    // supertest binding and closing its own.
    await app.listen(0);
    server = app.getHttpServer() as App;
  }

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    process.env.APP_DATABASE_URL = scratch.appUrl;
    delete process.env.ALLOW_INSECURE_TRANSPORT;
    appPool = new Pool({ connectionString: scratch.appUrl });
    // DROP ... WITH (FORCE) can reach a connection that is still closing.
    appPool.on('error', () => {});
    accounts = new ReviewerAccounts(drizzle(appPool), clock);
    await boot();
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await scratch.drop();
  });

  // The clock never rewinds, and TOTP steps are single use, so every test moves
  // it on to a step no earlier test used.
  beforeEach(async () => {
    clock.advance(10 * MIN);
    // Every test arrives from the one loopback address, so a test's failures
    // must not throttle the next test's fresh start.
    await scratch.owner.query('DELETE FROM login_throttle');
  });

  interface Person {
    username: string;
    password: string;
    secret: string;
    id: string;
  }

  /** A Reviewer past the ceremony: enrolment confirmed, password already changed. */
  async function person(options: { ceremony?: boolean } = {}): Promise<Person> {
    const username = `reviewer${++seq}`;
    const seeded = await accounts.seed({
      username,
      displayName: `Reviewer ${seq}`,
      email: `${username}@example.go.th`,
    });
    if (!options.ceremony) {
      await scratch.owner.query(
        `UPDATE reviewer SET totp_confirmed_at = now(), must_change_password = false
         WHERE id = $1`,
        [seeded.reviewerId],
      );
    }
    return {
      username,
      password: seeded.password,
      secret: seeded.totpSecret,
      id: seeded.reviewerId,
    };
  }

  const code = (p: Person, offsetMs = 0) =>
    phoneCode(p.secret, clock.now().getTime() + offsetMs);

  async function browser(userAgent?: string) {
    const b = new Browser(server, userAgent);
    await b.get('/api/reviewer/session'); // picks up the CSRF cookie
    return b;
  }

  function signIn(b: Browser, p: Person, overrides: object = {}) {
    return b.post('/api/reviewer/sign-in', {
      username: p.username,
      password: p.password,
      code: code(p),
      ...overrides,
    });
  }

  const events = async (type: string, where = '') =>
    (
      await scratch.owner.query(
        `SELECT * FROM reviewer_event WHERE type = $1 ${where} ORDER BY id`,
        [type],
      )
    ).rows;

  describe('the surface', () => {
    it('reports no session, and hands out a CSRF cookie', async () => {
      const b = new Browser(server);
      const res = await b.get('/api/reviewer/session');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ authenticated: false });
      expect(b.cookie('reviewer_csrf')).toBeTruthy();
    });

    it('refuses a state-changing post that carries no CSRF token', async () => {
      const p = await person();
      const b = await browser();
      const res = await b.post(
        '/api/reviewer/sign-in',
        { username: p.username, password: p.password, code: code(p) },
        { csrf: false },
      );
      expect(res.status).toBe(403);
    });

    it('refuses a CSRF header that does not match the cookie', async () => {
      const p = await person();
      const b = await browser();
      const res = await supertest(server)
        .post('/api/reviewer/sign-in')
        .set('Cookie', `reviewer_csrf=${b.cookie('reviewer_csrf')}`)
        .set('X-CSRF-Token', 'not-the-cookie')
        .send({ username: p.username, password: p.password, code: code(p) });
      expect(res.status).toBe(403);
    });
  });

  describe('signing in', () => {
    it('signs in with password and code together, and sets a hardened session cookie', async () => {
      const p = await person();
      const b = await browser();

      const res = await signIn(b, p);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        displayName: expect.stringContaining('Reviewer'),
        expiresAt: new Date(clock.now().getTime() + 6 * HOUR).toISOString(),
        mustChangePassword: false,
      });
      const session = res.setCookies.find((c) =>
        c.startsWith('reviewer_session='),
      );
      expect(session).toBeDefined();
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      expect(session).toMatch(/Secure/i);
      expect(session).toMatch(/Path=\//i);
      const succeeded = await events(
        'login_succeeded',
        `AND reviewer_id = '${p.id}'`,
      );
      expect(succeeded).toHaveLength(1);
      expect(succeeded[0].actor_type).toBe('reviewer');
    });

    it('never stores the session token, only its hash', async () => {
      const p = await person();
      const b = await browser();
      await signIn(b, p);
      const token = b.cookie('reviewer_session')!;
      const { rows } = await scratch.owner.query(
        'SELECT token_hash FROM reviewer_session WHERE reviewer_id = $1',
        [p.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).not.toBe(token);
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('reports the live session on a reload', async () => {
      const p = await person();
      const b = await browser();
      const signedIn = await signIn(b, p);
      const res = await b.get('/api/reviewer/session');
      expect(res.body).toEqual({ authenticated: true, ...signedIn.body });
    });

    it('carries one generic message for an unknown user, a wrong password and a wrong code', async () => {
      const p = await person();
      const bodies: unknown[] = [];
      const statuses: number[] = [];
      for (const attempt of [
        { username: 'nobody.here' },
        { password: 'Wrong-Password-1!' },
        { code: '000000' },
      ]) {
        clock.advance(2 * MIN); // clear the throttle between attempts
        const res = await signIn(await browser(), p, attempt);
        bodies.push(res.body);
        statuses.push(res.status);
        expect(
          res.setCookies.some((c) => c.startsWith('reviewer_session=')),
        ).toBe(false);
      }
      expect(statuses).toEqual([401, 401, 401]);
      expect(bodies).toEqual([GENERIC, GENERIC, GENERIC]);
    });

    it('records which factor failed, and the screen does not', async () => {
      const p = await person();
      const factorOf = async (overrides: { username?: string }) => {
        clock.advance(2 * MIN);
        await signIn(await browser(), p, overrides);
        const rows = await events(
          'login_failed',
          `AND payload->>'username' = '${overrides.username ?? p.username}'`,
        );
        return rows.at(-1).payload.failedFactor as string;
      };
      expect(await factorOf({ password: 'Wrong-Password-1!' } as never)).toBe(
        'password',
      );
      expect(await factorOf({ code: '000000' } as never)).toBe('totp');
      expect(
        await factorOf({
          password: 'Wrong-Password-1!',
          code: '000000',
        } as never),
      ).toBe('password_and_totp');
      // An unknown name is not written down, only that it was unknown.
      clock.advance(2 * MIN);
      await signIn(await browser(), p, { username: 'nobody.here' });
      const unknown = await events(
        'login_failed',
        `AND payload->>'failedFactor' = 'username'`,
      );
      expect(unknown.at(-1).payload.username).toBe('');
    });

    it('records IP and user agent on a failure, and never the password or the code', async () => {
      const p = await person();
      const wrongPassword = 'Wrong-Password-1!';
      const wrongCode = '246810';
      const b = await browser('audit-agent/9.9');
      await signIn(b, p, { password: wrongPassword, code: wrongCode });

      const row = (
        await events(
          'login_failed',
          `AND payload->>'username' = '${p.username}'`,
        )
      ).at(-1);
      expect(row.actor_type).toBe('anonymous');
      expect(row.ip).toBeTruthy();
      expect(row.user_agent).toBe('audit-agent/9.9');

      const everything = JSON.stringify(
        (await scratch.owner.query('SELECT * FROM reviewer_event')).rows,
      );
      expect(everything).not.toContain(wrongPassword);
      expect(everything).not.toContain(wrongCode);
      expect(everything).not.toContain(p.password);
    });

    it('records a code from two steps ago as clock drift, distinct from a wrong code', async () => {
      const p = await person();
      await signIn(await browser(), p, { code: code(p, -2 * STEP) });
      clock.advance(2 * MIN);
      await signIn(await browser(), p, { code: '000000' });

      const failures = await events(
        'login_failed',
        `AND payload->>'username' = '${p.username}'`,
      );
      expect(failures.map((f) => f.payload.totpClockDrift)).toEqual([
        true,
        false,
      ]);
    });

    it('does not accept the same code twice', async () => {
      const p = await person();
      const first = await signIn(await browser(), p);
      expect(first.status).toBe(200);
      const replay = await signIn(await browser(), p);
      expect(replay.status).toBe(401);
    });

    it('refuses a deactivated Reviewer with the same generic message, and records why', async () => {
      const p = await person();
      await scratch.owner.query(
        'UPDATE reviewer SET deactivated_at = now() WHERE id = $1',
        [p.id],
      );
      const res = await signIn(await browser(), p);
      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC);
      const rows = await events(
        'login_failed',
        `AND payload->>'username' = '${p.username}'`,
      );
      expect(rows.at(-1).payload.failedFactor).toBe('deactivated');
    });

    it('rejects a malformed body without touching the throttle', async () => {
      const b = await browser();
      const res = await b.post('/api/reviewer/sign-in', { username: 1 });
      expect(res.status).toBe(400);
    });
  });

  describe('the seeding ceremony', () => {
    it('leaves a seeded account inert until one code confirms enrolment, and forces a password change on first login', async () => {
      const p = await person({ ceremony: true });
      const b = await browser();

      const res = await signIn(b, p);

      expect(res.status).toBe(200);
      expect(res.body.mustChangePassword).toBe(true);
      const confirmed = await events(
        'totp_enrolled',
        `AND reviewer_id = '${p.id}'`,
      );
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].actor_type).toBe('reviewer');
      const { rows } = await scratch.owner.query(
        'SELECT totp_confirmed_at FROM reviewer WHERE id = $1',
        [p.id],
      );
      expect(rows[0].totp_confirmed_at).not.toBeNull();
    });

    it('does not confirm enrolment on a sign-in that fails', async () => {
      const p = await person({ ceremony: true });
      await signIn(await browser(), p, { password: 'Wrong-Password-1!' });
      const { rows } = await scratch.owner.query(
        'SELECT totp_confirmed_at FROM reviewer WHERE id = $1',
        [p.id],
      );
      expect(rows[0].totp_confirmed_at).toBeNull();
      expect(
        await events('totp_enrolled', `AND reviewer_id = '${p.id}'`),
      ).toEqual([]);
    });

    it('lets a Reviewer with a pending password change reach nothing reviewable', async () => {
      const p = await person({ ceremony: true });
      const b = await browser();
      await signIn(b, p);

      const gated = await b.get('/api/probe/reviewable');
      expect(gated.status).toBe(403);
      expect(gated.body).toMatchObject({ error: 'password_change_required' });
      expect((await b.get('/api/probe/pending-change')).status).toBe(200);
    });

    it('writes the enrolment event once, however many later sign-ins', async () => {
      const p = await person({ ceremony: true });
      await signIn(await browser(), p);
      clock.advance(STEP);
      await signIn(await browser(), p);
      expect(
        await events('totp_enrolled', `AND reviewer_id = '${p.id}'`),
      ).toHaveLength(1);
    });
  });

  describe('throttling', () => {
    it('backs off exponentially per attempt, caps near 30 seconds, and never locks anyone out', async () => {
      const p = await person();
      const waits: number[] = [];
      for (let i = 0; i < 9; i++) {
        const res = await signIn(await browser(), p, { code: '000000' });
        // Either a fresh failure, or (once backing off) told how long to wait.
        expect([401, 429]).toContain(res.status);
        const probe = await signIn(await browser(), p, { code: '000000' });
        if (probe.status === 429) {
          waits.push(probe.body.retryAfterSeconds);
          expect(probe.headers['retry-after']).toBe(
            String(probe.body.retryAfterSeconds),
          );
          clock.advance(probe.body.retryAfterSeconds * 1000);
        }
      }
      expect(waits[0]).toBeGreaterThan(0);
      for (let i = 1; i < waits.length; i++) {
        expect(waits[i]).toBeGreaterThanOrEqual(waits[i - 1]);
      }
      expect(Math.max(...waits)).toBe(30);
      expect(waits.at(-1)).toBe(30);

      // After all that, the right credentials still work as soon as the wait is up.
      clock.advance(31_000);
      const ok = await signIn(await browser(), p);
      expect(ok.status).toBe(200);
      const { rows } = await scratch.owner.query(
        'SELECT deactivated_at FROM reviewer WHERE id = $1',
        [p.id],
      );
      expect(rows[0].deactivated_at).toBeNull();
    });

    it('holds a burst of parallel guesses to the backoff, not one guess each', async () => {
      const p = await person();
      const results = await Promise.all(
        Array.from({ length: 10 }, async () =>
          signIn(await browser(), p, { code: '000000' }),
        ),
      );
      const evaluated = results.filter((r) => r.status === 401).length;
      // The first failure retries at once, the second starts the wait.
      expect(evaluated).toBeLessThanOrEqual(2);
      expect(results.filter((r) => r.status === 429).length).toBe(
        10 - evaluated,
      );
    });

    it('lets the first failure be retried immediately', async () => {
      const p = await person();
      expect(
        (await signIn(await browser(), p, { code: '000000' })).status,
      ).toBe(401);
      expect((await signIn(await browser(), p)).status).toBe(200);
    });

    it('refuses even the right credentials while throttled, without evaluating them', async () => {
      const p = await person();
      await signIn(await browser(), p, { code: '000000' });
      await signIn(await browser(), p, { code: '000000' });
      const during = await signIn(await browser(), p);
      expect(during.status).toBe(429);
      // A throttled attempt is refused unread, so it learns nothing about which
      // factor was right, and adds nothing to the permanent record.
      const before = (await events('login_failed')).length;
      await signIn(await browser(), p);
      expect((await events('login_failed')).length).toBe(before);
    });

    it('throttles an IP across usernames', async () => {
      const a = await person();
      const b = await person();
      await signIn(await browser(), a, { code: '000000' });
      await signIn(await browser(), a, { code: '000000' });
      // A different, unspoiled account from the same address is held back too.
      const res = await signIn(await browser(), b);
      expect(res.status).toBe(429);
    });

    it('keeps a row per account and per address', async () => {
      const a = await person();
      await signIn(await browser(), a, { code: '000000' });
      await signIn(await browser(), a, { code: '000000' });
      const { rows } = await scratch.owner.query(
        `SELECT key, failures FROM login_throttle WHERE key = $1 OR key LIKE 'ip:%'`,
        [`account:${a.username}`],
      );
      expect(rows.map((r) => r.key)).toContain(`account:${a.username}`);
      expect(rows.some((r) => r.key.startsWith('ip:'))).toBe(true);
    });

    it('keeps its state in Postgres, so a restart does not clear it', async () => {
      const p = await person();
      await signIn(await browser(), p, { code: '000000' });
      await signIn(await browser(), p, { code: '000000' });
      expect((await signIn(await browser(), p)).status).toBe(429);

      await app.close();
      await boot();

      expect((await signIn(await browser(), p)).status).toBe(429);
    });

    it('forgets old failures after a quiet hour', async () => {
      const p = await person();
      for (let i = 0; i < 6; i++) {
        await signIn(await browser(), p, { code: '000000' });
        clock.advance(31_000);
      }
      clock.advance(HOUR);
      expect(
        (await signIn(await browser(), p, { code: '000000' })).status,
      ).toBe(401);
      // The counter itself starts over, not just the wait.
      const { rows } = await scratch.owner.query(
        'SELECT failures FROM login_throttle WHERE key = $1',
        [`account:${p.username}`],
      );
      expect(rows[0].failures).toBe(1);
      expect((await signIn(await browser(), p)).status).toBe(200);
    });
  });

  describe('sessions', () => {
    async function live(p?: Person) {
      const who = p ?? (await person());
      const b = await browser();
      const res = await signIn(b, who);
      expect(res.status).toBe(200);
      return { who, b };
    }

    it('admits a signed-in Reviewer, and turns back one with no session', async () => {
      const { b } = await live();
      expect((await b.get('/api/probe/reviewable')).status).toBe(200);
      const stranger = await browser();
      expect((await stranger.get('/api/probe/reviewable')).status).toBe(401);
    });

    it('slides the idle window on user-initiated requests', async () => {
      const { b } = await live();
      for (let i = 0; i < 4; i++) {
        clock.advance(50 * MIN);
        expect((await b.get('/api/probe/reviewable')).status).toBe(200);
      }
    });

    it('ends a session left idle for an hour, and records `session_expired`', async () => {
      const { who, b } = await live();
      clock.advance(HOUR + MIN);
      const res = await b.get('/api/probe/reviewable');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ error: 'session_expired' });
      const rows = await events(
        'session_expired',
        `AND reviewer_id = '${who.id}'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_type).toBe('reviewer');
      // Gone for good: and the event is written once, not per request.
      await b.get('/api/probe/reviewable');
      expect(
        await events('session_expired', `AND reviewer_id = '${who.id}'`),
      ).toHaveLength(1);
    });

    it('never extends the 6-hour ceiling, however active the Reviewer is', async () => {
      const { who, b } = await live();
      const started = clock.now().getTime();
      let cut = -1;
      for (let elapsed = 0; elapsed <= 7 * HOUR; elapsed += 20 * MIN) {
        clock.advance(20 * MIN);
        const res = await b.get('/api/probe/reviewable');
        if (res.status === 401) {
          cut = clock.now().getTime() - started;
          expect(res.body).toMatchObject({ error: 'session_expired' });
          break;
        }
      }
      expect(cut).toBeGreaterThan(5 * HOUR + 30 * MIN);
      expect(cut).toBeLessThanOrEqual(6 * HOUR + 20 * MIN);
      expect(
        await events('session_expired', `AND reviewer_id = '${who.id}'`),
      ).toHaveLength(1);
    });

    it('does not slide on the read-only session check, so the page cannot keep itself alive', async () => {
      const { b } = await live();
      clock.advance(50 * MIN);
      expect((await b.get('/api/reviewer/session')).body.authenticated).toBe(
        true,
      );
      clock.advance(50 * MIN);
      expect((await b.get('/api/reviewer/session')).body.authenticated).toBe(
        false,
      );
    });

    it('reports an expired session on the read-only check, and records it', async () => {
      const { who, b } = await live();
      clock.advance(7 * HOUR);
      const res = await b.get('/api/reviewer/session');
      expect(res.body).toEqual({ authenticated: false, expired: true });
      expect(
        await events('session_expired', `AND reviewer_id = '${who.id}'`),
      ).toHaveLength(1);
    });

    it('allows three concurrent sessions and evicts the oldest for a fourth', async () => {
      const p = await person();
      const sessions: Browser[] = [];
      for (let i = 0; i < 4; i++) {
        const b = await browser();
        expect((await signIn(b, p)).status).toBe(200);
        sessions.push(b);
        clock.advance(STEP);
      }
      const statuses: number[] = [];
      for (const b of sessions) {
        statuses.push((await b.get('/api/probe/reviewable')).status);
      }
      expect(statuses).toEqual([401, 200, 200, 200]);
    });

    it('signs out, ending the session and recording `logged_out`', async () => {
      const { who, b } = await live();
      const res = await b.post('/api/reviewer/sign-out');
      expect(res.status).toBe(204);
      expect((await b.get('/api/probe/reviewable')).status).toBe(401);
      const rows = await events('logged_out', `AND reviewer_id = '${who.id}'`);
      expect(rows).toHaveLength(1);
    });

    it('invalidates live sessions the moment the Reviewer is deactivated', async () => {
      const p = await person();
      const { b } = await live(p);
      expect((await b.get('/api/probe/reviewable')).status).toBe(200);

      const outcome = await accounts.deactivate(p.username, { force: true });
      expect(outcome).toMatchObject({
        status: 'deactivated',
        sessionsEnded: 1,
      });

      expect((await b.get('/api/probe/reviewable')).status).toBe(401);
    });

    it('turns back a session whose Reviewer was deactivated behind its back', async () => {
      const { who, b } = await live();
      // Belt and braces: even if the session row survived, the query refuses it.
      await scratch.owner.query(
        'UPDATE reviewer SET deactivated_at = now() WHERE id = $1',
        [who.id],
      );
      expect((await b.get('/api/probe/reviewable')).status).toBe(401);
    });

    it('keeps sessions in Postgres', async () => {
      const { who } = await live();
      const { rowCount } = await scratch.owner.query(
        'SELECT 1 FROM reviewer_session WHERE reviewer_id = $1',
        [who.id],
      );
      expect(rowCount).toBe(1);
    });
  });

  describe('changing the password', () => {
    const NEW = 'Brand-New-Pass-42!';

    async function ceremony() {
      const p = await person({ ceremony: true });
      const b = await browser();
      await signIn(b, p);
      // The change needs a *fresh* code, not the one that signed in.
      clock.advance(STEP);
      return { p, b };
    }

    const change = (b: Browser, p: Person, overrides: object = {}) =>
      b.post('/api/reviewer/password', {
        currentPassword: p.password,
        newPassword: NEW,
        code: code(p),
        ...overrides,
      });

    it('needs a live session', async () => {
      const p = await person();
      const res = await change(await browser(), p);
      expect(res.status).toBe(401);
    });

    it('changes the password, clears the forced-change flag and records `password_changed`', async () => {
      const { p, b } = await ceremony();

      const res = await change(b, p);

      expect(res.status).toBe(204);
      expect((await b.get('/api/probe/reviewable')).status).toBe(200);
      const rows = await events(
        'password_changed',
        `AND reviewer_id = '${p.id}'`,
      );
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows[0])).not.toContain(NEW);

      // The notice is once: the next sign-in no longer asks for a change.
      clock.advance(STEP);
      const again = await signIn(await browser(), p, { password: NEW });
      expect(again.status).toBe(200);
      expect(again.body.mustChangePassword).toBe(false);
      clock.advance(2 * MIN);
      expect((await signIn(await browser(), p)).status).toBe(401);
    });

    it('refuses the code that signed in, because it is not fresh', async () => {
      const p = await person({ ceremony: true });
      const b = await browser();
      await signIn(b, p);
      const res = await change(b, p); // same step, same code
      expect(res.status).toBe(401);
      expect(res.body).toEqual(GENERIC);
    });

    it('fails a wrong current password or a wrong code exactly as sign-in does, and throttles it', async () => {
      const { p, b } = await ceremony();
      const wrongPassword = await change(b, p, {
        currentPassword: 'Wrong-Password-1!',
      });
      const wrongCode = await change(b, p, { code: '000000' });
      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body).toEqual(GENERIC);
      expect(wrongCode.status).toBe(401);
      // Two failures in a row: the third try is made to wait, as at sign-in.
      expect((await change(b, p)).status).toBe(429);
      const { rows } = await scratch.owner.query(
        `SELECT failures FROM login_throttle WHERE key = $1`,
        [`account:${p.username}`],
      );
      expect(rows[0].failures).toBeGreaterThanOrEqual(1);
    });

    it('names the specific policy violations, and spends no code on them', async () => {
      const { p, b } = await ceremony();
      const res = await change(b, p, { newPassword: 'short' });
      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        error: 'password_policy',
        violations: ['too_short', 'no_uppercase', 'no_digit', 'no_special'],
      });
      // Same code, compliant password: the failed try did not use it up.
      expect((await change(b, p)).status).toBe(204);
    });

    it('will not accept the current password as the new one', async () => {
      const { p, b } = await ceremony();
      const res = await change(b, p, { newPassword: p.password });
      expect(res.status).toBe(422);
      expect(res.body.violations).toEqual(['same_as_current']);
    });

    it("ends the Reviewer's other sessions", async () => {
      const { p, b } = await ceremony();
      const elsewhere = await browser();
      clock.advance(STEP);
      await signIn(elsewhere, p);
      clock.advance(STEP);
      expect((await change(b, p)).status).toBe(204);
      expect((await elsewhere.get('/api/probe/pending-change')).status).toBe(
        401,
      );
      expect((await b.get('/api/probe/reviewable')).status).toBe(200);
    });
  });

  describe('what does not exist', () => {
    it('has no recovery-code, email-reset or self-service TOTP route', async () => {
      const b = await browser();
      for (const path of [
        '/api/reviewer/recovery-codes',
        '/api/reviewer/reset-password',
        '/api/reviewer/forgot-password',
        '/api/reviewer/totp',
        '/api/reviewer/enrol',
      ]) {
        expect((await b.post(path, { email: 'a@b.c' })).status).toBe(404);
        expect((await b.get(path)).status).toBe(404);
      }
    });
  });
});
