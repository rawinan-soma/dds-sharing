import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import * as OTPAuth from "otpauth";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/configure-app.js";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { hashPassword } from "../src/auth/password-hash.js";
import { generateTotpSecret } from "../src/auth/totp.js";
import { insertReviewer } from "../src/auth/reviewer.repository.js";
import {
  startFakeUpstreamServer,
  type FakeUpstreamServerHandle,
} from "../src/upstream/fake-harness/fake-upstream-server.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
const PASSWORD = "Correct-Horse1!";

function codeFor(secretBase32: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: "DDS Sharing",
    label: "e2e",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

function extractCookie(res: Response, name: string): string | undefined {
  const cookies =
    (
      res.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie?.() ?? [];
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  return match?.split(";")[0]?.split("=").slice(1).join("=");
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    diseaseGroupId: "silicosis",
    from: "2026-01-01",
    to: "2026-01-31",
    contact: {
      name: "สมชาย",
      surname: "ใจดี",
      tel: "0812345678",
      email: "somchai@example.com",
      workplace: "โรงพยาบาลตัวอย่าง",
    },
    ...overrides,
  };
}

/** Polls until a Probe fired by a submit lands (or fails), rather than racing its background write. */
async function waitForProbeRowCount(
  fetchDetail: () => Promise<number | "pending" | "failed">,
): Promise<number | "pending" | "failed"> {
  const deadline = Date.now() + 2000;
  for (;;) {
    const value = await fetchDetail();
    if (value !== "pending" || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe.skipIf(!adminUrl || !appUrl)(
  "GET /api/reviewer/queue (e2e, ticket #65)",
  () => {
    let app: INestApplication;
    let baseUrl: string;
    let admin: ReturnType<typeof createDb>;
    let secret: OTPAuth.Secret;
    let sessionCookie: string;
    let harness: FakeUpstreamServerHandle;

    beforeAll(async () => {
      await runMigrations(adminUrl);
      admin = createDb(adminUrl);
      await admin.pool.query('TRUNCATE TABLE "reviewer" CASCADE');
      await admin.pool.query(
        'TRUNCATE TABLE "reviewer_login_throttle" CASCADE',
      );
      secret = generateTotpSecret();
      await insertReviewer(admin.db, {
        username: "e2e-queue-reviewer",
        displayName: "E2E Queue Reviewer",
        passwordHash: await hashPassword(PASSWORD),
        totpSecret: secret.base32,
      });

      // The Probe (§5.4) fires off every submit — point it at the dev harness
      // rather than the sentinel https://upstream.test.invalid, so it resolves
      // fast and deterministically instead of retrying a DNS failure.
      harness = await startFakeUpstreamServer();
      process.env.UPSTREAM_BASE_URL = harness.url;

      app = await NestFactory.create(AppModule, { logger: false });
      configureApp(app);
      await app.listen(0);
      baseUrl = await app.getUrl();

      const csrfRes = await fetch(`${baseUrl}/api/reviewer/csrf`);
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const csrfCookie = extractCookie(csrfRes, "reviewer_csrf")!;

      const signInRes = await fetch(`${baseUrl}/api/reviewer/session`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `reviewer_csrf=${csrfCookie}`,
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          username: "e2e-queue-reviewer",
          password: PASSWORD,
          totpCode: codeFor(secret.base32),
        }),
      });
      sessionCookie = extractCookie(signInRes, "reviewer_session")!;
    });

    afterAll(async () => {
      await app.close();
      await admin.pool.end();
      await harness.close();
    });

    beforeEach(async () => {
      await admin.pool.query("DELETE FROM request_event");
      await admin.pool.query("DELETE FROM request_contact");
      await admin.pool.query("DELETE FROM request");
      await admin.pool.query("DELETE FROM reference_number_counter");
    });

    it("refuses an unauthenticated list and detail request", async () => {
      const list = await fetch(`${baseUrl}/api/reviewer/queue`);
      expect(list.status).toBe(401);

      const detail = await fetch(
        `${baseUrl}/api/reviewer/queue/00000000-0000-0000-0000-000000000000`,
      );
      expect(detail.status).toBe(401);
    });

    it("lists a submitted, still-pending Request with no contact-free row missing and a refresh timestamp", async () => {
      const submitRes = await fetch(`${baseUrl}/api/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody()),
      });
      expect(submitRes.status).toBe(201);
      const { referenceNumber } = await submitRes.json();

      const res = await fetch(`${baseUrl}/api/reviewer/queue`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.requests).toHaveLength(1);
      expect(body.requests[0].referenceNumber).toBe(referenceNumber);
      expect(body.requests[0].requesterName).toBe("สมชาย ใจดี");
      expect(body.refreshedAt).toBeDefined();
    });

    it("serves the detail of a listed Request with the five contact fields, and 404s an unknown id", async () => {
      await fetch(`${baseUrl}/api/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody()),
      });

      const list = await fetch(`${baseUrl}/api/reviewer/queue`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      const { requests } = await list.json();
      const id = requests[0].id;

      const detailRes = await fetch(`${baseUrl}/api/reviewer/queue/${id}`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      expect(detailRes.status).toBe(200);
      const detail = await detailRes.json();
      expect(Object.keys(detail.contact).sort()).toEqual([
        "email",
        "name",
        "surname",
        "tel",
        "workplace",
      ]);
      expect(detail.requestsAhead).toBe(0);

      // §5.4: the count is pending at submit, then lands off the submit path —
      // "silicosis" is codes 202/203, each 2 rows on the fake harness's
      // default fixture, summed to 4.
      const probeRowCount = await waitForProbeRowCount(async () => {
        const res = await fetch(`${baseUrl}/api/reviewer/queue/${id}`, {
          headers: { cookie: `reviewer_session=${sessionCookie}` },
        });
        return (await res.json()).probeRowCount;
      });
      expect(probeRowCount).toBe(4);

      const missing = await fetch(
        `${baseUrl}/api/reviewer/queue/00000000-0000-0000-0000-000000000000`,
        {
          headers: { cookie: `reviewer_session=${sessionCookie}` },
        },
      );
      expect(missing.status).toBe(404);

      const malformed = await fetch(
        `${baseUrl}/api/reviewer/queue/not-a-uuid`,
        {
          headers: { cookie: `reviewer_session=${sessionCookie}` },
        },
      );
      expect(malformed.status).toBe(404);
    });

    // The Decision (spec §10.3, §10.4, ticket #66) -----------------------

    async function submitOne(): Promise<{ id: string; referenceNumber: string }> {
      const res = await fetch(`${baseUrl}/api/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody()),
      });
      const { referenceNumber } = await res.json();
      const list = await fetch(`${baseUrl}/api/reviewer/queue`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      const { requests } = await list.json();
      const row = requests.find(
        (r: { referenceNumber: string }) => r.referenceNumber === referenceNumber,
      );
      return { id: row.id, referenceNumber };
    }

    async function csrfHeaders(): Promise<Record<string, string>> {
      const csrfRes = await fetch(`${baseUrl}/api/reviewer/csrf`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
      const csrfCookie = extractCookie(csrfRes, "reviewer_csrf")!;
      return {
        "content-type": "application/json",
        cookie: `reviewer_session=${sessionCookie}; reviewer_csrf=${csrfCookie}`,
        "x-csrf-token": csrfToken,
      };
    }

    it("refuses approve and reject without the CSRF token, and without a live session", async () => {
      const { id } = await submitOne();

      const noCsrf = await fetch(`${baseUrl}/api/reviewer/queue/${id}/approve`, {
        method: "POST",
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      expect(noCsrf.status).toBe(403);

      const headers = await csrfHeaders();
      const noSession = await fetch(`${baseUrl}/api/reviewer/queue/${id}/approve`, {
        method: "POST",
        headers: {
          ...headers,
          cookie: headers.cookie.replace(
            /reviewer_session=[^;]+/,
            "reviewer_session=not-a-real-session",
          ),
        },
      });
      expect(noSession.status).toBe(401);

      // Neither attempt should have moved the Request off pending.
      const detail = await fetch(`${baseUrl}/api/reviewer/queue/${id}`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      expect(detail.status).toBe(200);
    });

    it("approves a pending Request, moves it off the queue, and states plainly what was recorded", async () => {
      const { id } = await submitOne();
      const headers = await csrfHeaders();

      const res = await fetch(`${baseUrl}/api/reviewer/queue/${id}/approve`, {
        method: "POST",
        headers,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.outcome).toBe("approved");
      expect(body.decidedAt).toBeDefined();

      const stillListed = await fetch(`${baseUrl}/api/reviewer/queue`, {
        headers: { cookie: `reviewer_session=${sessionCookie}` },
      });
      const { requests } = await stillListed.json();
      expect(requests.find((r: { id: string }) => r.id === id)).toBeUndefined();
    });

    it("refuses a reject with no internal note, and refuses approving an already-decided Request", async () => {
      const { id } = await submitOne();
      const headers = await csrfHeaders();

      const tooShort = await fetch(`${baseUrl}/api/reviewer/queue/${id}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ note: "short" }),
      });
      expect(tooShort.status).toBe(409);

      const ok = await fetch(`${baseUrl}/api/reviewer/queue/${id}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          note: "Could not confirm this person's workplace by telephone.",
        }),
      });
      expect(ok.status).toBe(201);
      expect((await ok.json()).outcome).toBe("rejected");

      const again = await fetch(`${baseUrl}/api/reviewer/queue/${id}/approve`, {
        method: "POST",
        headers,
      });
      expect(again.status).toBe(409);
    });
  },
);
