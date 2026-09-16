import { describe, expect, it } from "vitest";
import {
  UpstreamAuthError,
  UpstreamRetriesExhaustedError,
  UpstreamServerError,
  UpstreamValidationError,
} from "../upstream/upstream-client-errors.js";
import { StallError } from "./stall-watchdog.js";
import {
  CompletenessMismatchError,
  classifyExtractionFailure,
} from "./job-failure.js";

describe("classifyExtractionFailure", () => {
  it("classifies a completeness mismatch, keeping its request id", () => {
    const failure = classifyExtractionFailure(
      new CompletenessMismatchError("201", 5, 7, "req-abc"),
    );
    expect(failure.failureCause).toBe("completeness_mismatch");
    expect(failure.xRequestId).toBe("req-abc");
  });

  it("classifies a stall with no request id", () => {
    const failure = classifyExtractionFailure(new StallError());
    expect(failure.failureCause).toBe("stall");
    expect(failure.xRequestId).toBeNull();
  });

  it("classifies an auth rejection as auth_expiry", () => {
    const error = new UpstreamAuthError();
    error.requestId = "req-auth";
    const failure = classifyExtractionFailure(error);
    expect(failure.failureCause).toBe("auth_expiry");
    expect(failure.xRequestId).toBe("req-auth");
  });

  it("classifies exhausted retries as upstream_5xx, keeping the last error's request id", () => {
    const last = new UpstreamServerError(503);
    last.requestId = "req-503";
    const failure = classifyExtractionFailure(
      new UpstreamRetriesExhaustedError(last),
    );
    expect(failure.failureCause).toBe("upstream_5xx");
    expect(failure.xRequestId).toBe("req-503");
  });

  it("classifies an unexpected non-retryable client error as internal", () => {
    const failure = classifyExtractionFailure(new UpstreamValidationError());
    expect(failure.failureCause).toBe("internal");
  });

  it("classifies anything else as internal, with no request id", () => {
    const failure = classifyExtractionFailure(new Error("boom"));
    expect(failure.failureCause).toBe("internal");
    expect(failure.xRequestId).toBeNull();
  });
});
