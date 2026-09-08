import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/configure-app.js";

// @nestjs/testing's in-memory TestingModule does not reliably register
// @nestjs/serve-static's middleware (it wires up before routes are bound),
// so this suite boots a real app on an ephemeral port instead.
describe("App (e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureApp(app);
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the SPA shell at /", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("serves the SPA shell for an unknown client route (SPA fallback)", async () => {
    const res = await fetch(`${baseUrl}/some/spa/route`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("returns an API 404, not the SPA shell, for an unmatched /api route", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect((await res.json()).statusCode).toBe(404);
  });

  it("returns an API 404 for the bare /api path, not the SPA shell", async () => {
    const res = await fetch(`${baseUrl}/api`);
    expect(res.status).toBe(404);
    expect((await res.json()).statusCode).toBe(404);
  });

  it("does not let the static handler swallow /health under the api prefix", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(404);
    expect((await res.json()).statusCode).toBe(404);
  });

  it("serves /health unauthenticated, naming all four components", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.components).sort()).toEqual(
      ["disk", "extraction", "mail", "scheduler"].sort(),
    );
  });

  it("serves /health/scheduler as an alias of /health", async () => {
    const [health, alias] = await Promise.all([
      fetch(`${baseUrl}/health`).then((r) => r.json()),
      fetch(`${baseUrl}/health/scheduler`).then((r) => r.json()),
    ]);
    expect(alias).toEqual(health);
  });
});
