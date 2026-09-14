import { describe, it, expect } from "vitest";
import { activeInsecureFlags } from "./insecure-flags.js";

describe("activeInsecureFlags", () => {
  it("reports none when both flags are off", () => {
    expect(
      activeInsecureFlags({ allowInsecureTransport: false }, { allowPlaintext: false }),
    ).toEqual([]);
  });

  it("names ALLOW_INSECURE_TRANSPORT when it is on", () => {
    expect(
      activeInsecureFlags({ allowInsecureTransport: true }, { allowPlaintext: false }),
    ).toEqual(["ALLOW_INSECURE_TRANSPORT"]);
  });

  it("names SMTP_ALLOW_PLAINTEXT when it is on", () => {
    expect(
      activeInsecureFlags({ allowInsecureTransport: false }, { allowPlaintext: true }),
    ).toEqual(["SMTP_ALLOW_PLAINTEXT"]);
  });

  it("names both when both are on", () => {
    expect(
      activeInsecureFlags({ allowInsecureTransport: true }, { allowPlaintext: true }),
    ).toEqual(["ALLOW_INSECURE_TRANSPORT", "SMTP_ALLOW_PLAINTEXT"]);
  });
});
