import { describe, it, beforeAll, afterAll, expect } from "vitest";
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
  const cookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const match = cookies.find((c) => c.startsWith(`${name}=`));
  return match?.split(";")[0]?.split("=").slice(1).join("=");
}

describe.skipIf(!adminUrl || !appUrl)("Reviewer sign-in (e2e, spec §17.5)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let admin: ReturnType<typeof createDb>;
  let secret: OTPAuth.Secret;

  beforeAll(async () => {
    await runMigrations(adminUrl);
    admin = createDb(adminUrl);
    await admin.pool.query('TRUNCATE TABLE "reviewer" CASCADE');
    secret = generateTotpSecret();
    await insertReviewer(admin.db, {
      username: "e2e-reviewer",
      displayName: "E2E Reviewer",
      passwordHash: await hashPassword(PASSWORD),
      totpSecret: secret.base32,
    });

    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await admin.pool.end();
  });

  async function getCsrf(): Promise<{ token: string; cookie: string }> {
    const res = await fetch(`${baseUrl}/api/reviewer/csrf`);
    const body = (await res.json()) as { csrfToken: string };
    const cookie = extractCookie(res, "reviewer_csrf")!;
    return { token: body.csrfToken, cookie };
  }

  it("sends X-Robots-Tag: noindex on the reviewer surface (spec §17.4 — tidiness, not security)", async () => {
    const res = await fetch(`${baseUrl}/api/reviewer/csrf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("refuses a sign-in POST without a matching CSRF header", async () => {
    const { cookie } = await getCsrf();
    const res = await fetch(`${baseUrl}/api/reviewer/session`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `reviewer_csrf=${cookie}` },
      body: JSON.stringify({ username: "e2e-reviewer", password: PASSWORD, totpCode: "000000" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns one generic 401 for wrong credentials, whichever factor was wrong", async () => {
    const { token, cookie } = await getCsrf();
    const res = await fetch(`${baseUrl}/api/reviewer/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `reviewer_csrf=${cookie}`,
        "x-csrf-token": token,
      },
      body: JSON.stringify({ username: "e2e-reviewer", password: "wrong", totpCode: "000000" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_credentials" });
  });

  it("signs in with a correct password and TOTP code, setting an httpOnly session cookie", async () => {
    await admin.pool.query('TRUNCATE TABLE "reviewer_login_throttle" CASCADE'); // isolate from the earlier failed-attempt tests' backoff
    const { token, cookie } = await getCsrf();
    const res = await fetch(`${baseUrl}/api/reviewer/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `reviewer_csrf=${cookie}`,
        "x-csrf-token": token,
      },
      body: JSON.stringify({ username: "e2e-reviewer", password: PASSWORD, totpCode: codeFor(secret.base32) }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.displayName).toBe("E2E Reviewer");

    const setCookieHeader = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const sessionCookieLine = setCookieHeader.find((c) => c.startsWith("reviewer_session="))!;
    expect(sessionCookieLine).toContain("HttpOnly");
    expect(sessionCookieLine).toContain("SameSite=Lax");

    const sessionCookie = extractCookie(res, "reviewer_session")!;

    const whoAmI = await fetch(`${baseUrl}/api/reviewer/session`, {
      headers: { cookie: `reviewer_session=${sessionCookie}` },
    });
    expect(whoAmI.status).toBe(200);
    expect((await whoAmI.json()).displayName).toBe("E2E Reviewer");

    const { token: signOutToken, cookie: signOutCsrfCookie } = await getCsrf();
    const signOut = await fetch(`${baseUrl}/api/reviewer/session`, {
      method: "DELETE",
      headers: {
        cookie: `reviewer_session=${sessionCookie}; reviewer_csrf=${signOutCsrfCookie}`,
        "x-csrf-token": signOutToken,
      },
    });
    expect(signOut.status).toBe(204);

    const afterLogout = await fetch(`${baseUrl}/api/reviewer/session`, {
      headers: { cookie: `reviewer_session=${sessionCookie}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it("refuses an unauthenticated whoami", async () => {
    const res = await fetch(`${baseUrl}/api/reviewer/session`);
    expect(res.status).toBe(401);
  });
});
