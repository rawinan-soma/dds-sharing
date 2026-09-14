import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import { Pool } from "pg";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/configure-app.js";

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

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

describe.skipIf(!adminUrl || !appUrl)("POST /api/requests (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let adminPool: Pool;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
    adminPool = new Pool({ connectionString: adminUrl });
  });

  afterAll(async () => {
    await app.close();
    await adminPool.end();
  });

  beforeEach(async () => {
    await adminPool.query("DELETE FROM request_event");
    await adminPool.query("DELETE FROM request_contact");
    await adminPool.query("DELETE FROM request");
    await adminPool.query("DELETE FROM reference_number_counter");
  });

  it("submits a valid national request and returns 201 with a reference number", async () => {
    const res = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.referenceNumber).toMatch(/^REQ-\d{4}-\d{4,}$/);
    expect(body.area).toEqual({ kind: "national" });
    expect(body.servicePromiseBusinessHours).toBe(24);
  });

  it("rejects a span over 365 days with 400, attributing the cap to upstream", async () => {
    const res = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody({ from: "2026-01-01", to: "2027-06-01" })),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    const error = body.errors.find(
      (e: { code: string }) => e.code === "span_exceeds_cap",
    );
    expect(error).toBeDefined();
    expect(error.message).toMatch(/DDC API/);
  });

  it("never splits an over-span request — it is refused outright, not partially accepted", async () => {
    const res = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody({ from: "2026-01-01", to: "2027-06-01" })),
    });
    expect(res.status).toBe(400);

    const rows = await adminPool.query("SELECT count(*) FROM request");
    expect(Number(rows.rows[0].count)).toBe(0);
  });

  it("rejects a second submit from the same origin with 409 and the request_in_progress code", async () => {
    const first = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    expect(second.status).toBe(409);
    const secondBody = await second.json();
    expect(secondBody.code).toBe("request_in_progress");
    expect(secondBody.existingReferenceNumber).toBe(firstBody.referenceNumber);
  });

  it("never returns a row count anywhere in the response", async () => {
    const res = await fetch(`${baseUrl}/api/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/row.?count/i);
  });
});
