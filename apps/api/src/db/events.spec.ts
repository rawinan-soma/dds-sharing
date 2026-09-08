import { describe, it, expect } from "vitest";
import { REQUEST_EVENT_TYPES, REVIEWER_EVENT_TYPES, ACTOR_TYPES } from "./events.js";

describe("the closed event catalogue (§12.4)", () => {
  it("never includes mail_bounced", () => {
    expect(REQUEST_EVENT_TYPES).not.toContain("mail_bounced");
    expect(REVIEWER_EVENT_TYPES).not.toContain("mail_bounced");
  });

  it("has no duplicate types, and the two streams share no type name", () => {
    expect(new Set(REQUEST_EVENT_TYPES).size).toBe(REQUEST_EVENT_TYPES.length);
    expect(new Set(REVIEWER_EVENT_TYPES).size).toBe(REVIEWER_EVENT_TYPES.length);
    const overlap = REQUEST_EVENT_TYPES.filter((type) => (REVIEWER_EVENT_TYPES as readonly string[]).includes(type));
    expect(overlap).toEqual([]);
  });

  it("carries the four actor kinds §12.2 names", () => {
    expect(ACTOR_TYPES).toEqual(["requester", "reviewer", "system", "anonymous"]);
  });
});
