import type { ReportCode } from "./report-codes.js";

export interface DiseaseGroup {
  /**
   * Stable key. Stored Requests and Decision Snapshots reference this, so it
   * may never change even when the name or code list is revised
   * (`docs/disease-groups.md`).
   */
  readonly id: string;
  readonly nameTh: string;
  readonly reportCodes: readonly ReportCode[];
}

// Ten Disease groups over the 25 Report codes, seeded from
// `docs/disease-groups.md` and from nowhere else. The seed stays embedded —
// never fetched at boot or per Request (spec §4.9). Array order is picker
// order, matching the table in that file.
export const DISEASE_GROUPS: readonly DiseaseGroup[] = [
  {
    id: "air-pollution",
    nameTh: "โรคจากการสัมผัสมลพิษทางอากาศ",
    reportCodes: ["201"],
  },
  { id: "silicosis", nameTh: "โรคซิลิโคสิส", reportCodes: ["202", "203"] },
  {
    id: "asbestos",
    nameTh: "โรคจากแร่ใยหิน",
    reportCodes: ["204", "205", "206", "207"],
  },
  {
    id: "lead",
    nameTh: "โรคจากตะกั่วและสารประกอบของตะกั่ว",
    reportCodes: ["208"],
  },
  {
    id: "pesticides",
    nameTh: "โรคจากสารกำจัดศัตรูพืช",
    reportCodes: [
      "209",
      "210",
      "211",
      "212",
      "213",
      "214",
      "215",
      "216",
      "217",
      "218",
    ],
  },
  {
    id: "confined-space",
    nameTh: "การบาดเจ็บจากภาวะอับอากาศ",
    reportCodes: ["219"],
  },
  {
    id: "radiation",
    nameTh: "โรคจากรังสี",
    reportCodes: ["222", "223", "224"],
  },
  { id: "work-related", nameTh: "โรคจากการทำงาน", reportCodes: ["220"] },
  {
    id: "environmental-pollution",
    nameTh: "โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม",
    reportCodes: ["221"],
  },
  { id: "heat", nameTh: "โรคจากความร้อน", reportCodes: ["501"] },
];
