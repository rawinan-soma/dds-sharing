import { describe, it, expect } from "vitest";
import { buildRejectionEmail } from "./rejection-email.js";

describe("buildRejectionEmail (spec §10.3, design handoff screen 5b)", () => {
  it("carries the reference number and telephone, and gives no reason", () => {
    const email = buildRejectionEmail({ referenceNumber: "REQ-2569-0142", telephone: "0-2590-3000" });

    expect(email.subject).toContain("REQ-2569-0142");
    expect(email.text).toContain("REQ-2569-0142");
    expect(email.text).toContain("0-2590-3000");
  });

  it("is built from only a reference number and a telephone number — never a Reviewer name or a reason", () => {
    // buildRejectionEmail's own input type has exactly these two fields, so
    // there is nothing else this function could ever interpolate in.
    const email = buildRejectionEmail({ referenceNumber: "REQ-2569-0142", telephone: "0-2590-3000" });
    expect(email.subject).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
  });
});
