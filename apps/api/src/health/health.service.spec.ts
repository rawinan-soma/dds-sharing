import { describe, it, expect } from "vitest";
import { HealthService } from "./health.service.js";

const SECURE_TRANSPORT = { allowInsecureTransport: false };
const SECURE_SMTP = { allowPlaintext: false };

describe("HealthService", () => {
  it("does not report the overall status ok while a component is unknown", () => {
    const document = new HealthService(SECURE_TRANSPORT, SECURE_SMTP).check();

    expect(Object.values(document.components).every((c) => c.status === "unknown")).toBe(true);
    expect(document.status).toBe("unknown");
  });

  it("reports no insecure flags when both are off", () => {
    const document = new HealthService(SECURE_TRANSPORT, SECURE_SMTP).check();
    expect(document.insecureFlags).toEqual([]);
  });

  it("reports ALLOW_INSECURE_TRANSPORT when it is on", () => {
    const document = new HealthService({ allowInsecureTransport: true }, SECURE_SMTP).check();
    expect(document.insecureFlags).toEqual(["ALLOW_INSECURE_TRANSPORT"]);
  });

  it("reports SMTP_ALLOW_PLAINTEXT when it is on", () => {
    const document = new HealthService(SECURE_TRANSPORT, { allowPlaintext: true }).check();
    expect(document.insecureFlags).toEqual(["SMTP_ALLOW_PLAINTEXT"]);
  });
});
