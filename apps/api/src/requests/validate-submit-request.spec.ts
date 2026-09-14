import { describe, it, expect } from "vitest";
import { validateSubmitRequest } from "./validate-submit-request.js";
import { DISEASE_GROUPS } from "../reference-data/disease-groups.js";
import type { ProvinceRow } from "../reference-data/province-integrity.js";
import type { SubmitRequestInput } from "./submit-request.types.js";

const PROVINCES: ProvinceRow[] = [
  { provinceId: "10", nameTh: "กรุงเทพมหานคร", healthRegion: 13 },
  { provinceId: "39", nameTh: "หนองบัวลำภู", healthRegion: 8 },
  { provinceId: "41", nameTh: "อุดรธานี", healthRegion: 8 },
  { provinceId: "47", nameTh: "สกลนคร", healthRegion: 8 },
];

function validInput(
  overrides: Partial<SubmitRequestInput> = {},
): SubmitRequestInput {
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

function validate(input: SubmitRequestInput) {
  return validateSubmitRequest(input, DISEASE_GROUPS, PROVINCES);
}

describe("validateSubmitRequest — happy paths", () => {
  it("accepts a national request and expands the group to its Report codes", () => {
    const result = validate(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.diseaseGroupNameTh).toBe("โรคซิลิโคสิส");
    expect(result.value.reportCodes).toEqual(["202", "203"]);
    expect(result.value.days).toBe(31);
    expect(result.value.area).toEqual({ kind: "national" });
  });

  it("accepts a single province and freezes it as a one-entry list", () => {
    const result = validate(
      validInput({ area: { kind: "province", provinceId: "10" } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.area).toEqual({
      kind: "province",
      provinceId: "10",
      nameTh: "กรุงเทพมหานคร",
    });
  });

  it("expands a region to its province list, and keeps the region as the human form", () => {
    const result = validate(
      validInput({ area: { kind: "region", region: 8 } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.area).toEqual({
      kind: "region",
      region: 8,
      provinces: [
        { provinceId: "39", nameTh: "หนองบัวลำภู", healthRegion: 8 },
        { provinceId: "41", nameTh: "อุดรธานี", healthRegion: 8 },
        { provinceId: "47", nameTh: "สกลนคร", healthRegion: 8 },
      ],
    });
  });

  it("trims contact fields", () => {
    const result = validate(
      validInput({ contact: { ...validInput().contact, name: "  สมชาย  " } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.contact.name).toBe("สมชาย");
  });
});

describe("validateSubmitRequest — Disease group (§4.1)", () => {
  it("rejects a missing group", () => {
    const result = validate(validInput({ diseaseGroupId: "" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: "diseaseGroupId",
        code: "disease_group_required",
      }),
    );
  });

  it("rejects a group id the Requester could not have picked from the list", () => {
    const result = validate(validInput({ diseaseGroupId: "201" }));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: "diseaseGroupId",
        code: "disease_group_unknown",
      }),
    );
  });
});

describe("validateSubmitRequest — Date range (§4.2, §4.3)", () => {
  it("rejects a malformed date as invalid, never as a span-cap violation", () => {
    const result = validate(
      validInput({ from: "not-a-date", to: "2026-01-31" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: "dateRange",
        code: "date_range_invalid",
      }),
    );
    expect(result.errors).not.toContainEqual(
      expect.objectContaining({ code: "span_exceeds_cap" }),
    );
  });

  it("rejects a shape-matching but non-existent calendar date", () => {
    const result = validate(
      validInput({ from: "2026-02-30", to: "2026-03-01" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: "dateRange",
        code: "date_range_invalid",
      }),
    );
  });

  it("rejects an inverted range", () => {
    const result = validate(
      validInput({ from: "2026-01-31", to: "2026-01-01" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: "dateRange",
        code: "date_range_invalid",
      }),
    );
  });

  it("rejects a span over 365 days, naming the day count, and attributes the cap to upstream", () => {
    const result = validate(
      validInput({ from: "2026-01-01", to: "2027-01-01" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    const error = result.errors.find((e) => e.code === "span_exceeds_cap");
    expect(error).toBeDefined();
    expect(error?.details).toEqual({ days: 366 });
    expect(error?.message).toMatch(/DDC API/);
  });
});

describe("validateSubmitRequest — Area selection (§4.4)", () => {
  it("rejects an unknown province", () => {
    const result = validate(
      validInput({ area: { kind: "province", provinceId: "99" } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "area", code: "area_invalid" }),
    );
  });

  it("rejects a region outside 1-13", () => {
    const result = validate(
      validInput({ area: { kind: "region", region: 14 } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toContainEqual(
      expect.objectContaining({ field: "area", code: "area_invalid" }),
    );
  });
});

describe("validateSubmitRequest — Contact fields (§4.7)", () => {
  it("names every empty field in one message", () => {
    const result = validate(
      validInput({
        contact: {
          name: "สมชาย",
          surname: "",
          tel: "",
          email: "x@example.com",
          workplace: "",
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    const error = result.errors.find(
      (e) => e.code === "contact_field_required",
    );
    expect(error).toBeDefined();
    expect(error?.details?.missingFields).toEqual([
      "surname",
      "tel",
      "workplace",
    ]);
  });

  it("does not reject an unusual but non-empty email or tel — nothing is format-validated", () => {
    const result = validate(
      validInput({
        contact: {
          name: "a",
          surname: "b",
          tel: "not-a-phone",
          email: "not-an-email",
          workplace: "c",
        },
      }),
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateSubmitRequest — collects every error in one pass", () => {
  it("reports the group, the span and the contact fields together", () => {
    const result = validate({
      diseaseGroupId: "",
      from: "2026-01-01",
      to: "2027-06-01",
      contact: { name: "", surname: "", tel: "", email: "", workplace: "" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected errors");
    const fields = result.errors.map((e) => e.field).sort();
    expect(fields).toEqual(["contact", "dateRange", "diseaseGroupId"]);
  });
});
