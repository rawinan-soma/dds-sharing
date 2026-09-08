import { describe, it, expect } from "vitest";
import { HealthService } from "./health.service.js";

describe("HealthService", () => {
  it("does not report the overall status ok while a component is unknown", () => {
    const document = new HealthService().check();

    expect(Object.values(document.components).every((c) => c.status === "unknown")).toBe(true);
    expect(document.status).toBe("unknown");
  });
});
