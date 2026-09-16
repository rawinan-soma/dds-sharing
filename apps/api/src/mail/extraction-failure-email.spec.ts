import { describe, it, expect } from "vitest";
import { buildExtractionFailureEmail } from "./extraction-failure-email.js";

describe("buildExtractionFailureEmail (spec §7, §14.3)", () => {
  it("carries the reference number and telephone", () => {
    const email = buildExtractionFailureEmail({
      referenceNumber: "REQ-2569-0142",
      telephone: "0-2590-3000",
    });

    expect(email.subject).toContain("REQ-2569-0142");
    expect(email.text).toContain("REQ-2569-0142");
    expect(email.text).toContain("0-2590-3000");
  });

  it("is built from only a reference number and a telephone number — never a cause", () => {
    // buildExtractionFailureEmail's own input type has exactly these two
    // fields, so there is nothing else this function could ever
    // interpolate in — the cause split stays in `job_failed` alone (§14.3).
    const email = buildExtractionFailureEmail({
      referenceNumber: "REQ-2569-0142",
      telephone: "0-2590-3000",
    });
    expect(email.subject).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
  });
});
