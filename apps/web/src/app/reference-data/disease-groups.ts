export interface DiseaseGroup {
  /** Stable key — never shown, never typed by the Requester (spec §4.9). */
  readonly id: string;
  readonly nameTh: string;
}

// The ten Disease groups (spec §4.9, docs/disease-groups.md), mirrored from
// apps/api/src/reference-data/disease-groups.ts. A fixed seed baked into the
// build, never fetched at runtime (§16.1: "no per-request server data on the
// form"). Array order is picker order.
export const DISEASE_GROUPS: readonly DiseaseGroup[] = [
  { id: 'air-pollution', nameTh: 'โรคจากการสัมผัสมลพิษทางอากาศ' },
  { id: 'silicosis', nameTh: 'โรคซิลิโคสิส' },
  { id: 'asbestos', nameTh: 'โรคจากแร่ใยหิน' },
  { id: 'lead', nameTh: 'โรคจากตะกั่วและสารประกอบของตะกั่ว' },
  { id: 'pesticides', nameTh: 'โรคจากสารกำจัดศัตรูพืช' },
  { id: 'confined-space', nameTh: 'การบาดเจ็บจากภาวะอับอากาศ' },
  { id: 'radiation', nameTh: 'โรคจากรังสี' },
  { id: 'work-related', nameTh: 'โรคจากการทำงาน' },
  {
    id: 'environmental-pollution',
    nameTh: 'โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม',
  },
  { id: 'heat', nameTh: 'โรคจากความร้อน' },
];
