export interface DiseaseGroup {
  /** Stable key that outlives the name: stored Requests and Snapshots hold it. */
  id: string;
  name: string;
  reportCodes: string[];
}

// Embedded from docs/disease-groups.md and from nowhere else: never fetched at
// boot or per Request. A spec asserts this list equals that file, so an edit to
// one without the other fails CI. The id may not change; the name and the code
// list may. Picker order is the order below.
//
// The Report codes are neither contiguous nor a fixed count — 501 sits far
// outside 201-224 — so nothing may assume a range or a length.
export const DISEASE_GROUPS: readonly DiseaseGroup[] = [
  {
    id: 'air-pollution',
    name: 'โรคจากการสัมผัสมลพิษทางอากาศ',
    reportCodes: ['201'],
  },
  { id: 'silicosis', name: 'โรคซิลิโคสิส', reportCodes: ['202', '203'] },
  {
    id: 'asbestos',
    name: 'โรคจากแร่ใยหิน',
    reportCodes: ['204', '205', '206', '207'],
  },
  {
    id: 'lead',
    name: 'โรคจากตะกั่วและสารประกอบของตะกั่ว',
    reportCodes: ['208'],
  },
  {
    id: 'pesticides',
    name: 'โรคจากสารกำจัดศัตรูพืช',
    reportCodes: [
      '209',
      '210',
      '211',
      '212',
      '213',
      '214',
      '215',
      '216',
      '217',
      '218',
    ],
  },
  {
    id: 'confined-space',
    name: 'การบาดเจ็บจากภาวะอับอากาศ',
    reportCodes: ['219'],
  },
  { id: 'radiation', name: 'โรคจากรังสี', reportCodes: ['222', '223', '224'] },
  { id: 'work-related', name: 'โรคจากการทำงาน', reportCodes: ['220'] },
  {
    id: 'environmental-pollution',
    name: 'โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม',
    reportCodes: ['221'],
  },
  { id: 'heat', name: 'โรคจากความร้อน', reportCodes: ['501'] },
];

export function diseaseGroupOfReportCode(
  reportCode: string,
): DiseaseGroup | undefined {
  return DISEASE_GROUPS.find((g) => g.reportCodes.includes(reportCode));
}

// A code in two groups makes "which Extract did this case land in" unanswerable;
// a group with no code can be picked and asks for nothing. The other half of the
// partition — a code in no group — needs the Report code seed and is the CI test.
export function assertDiseaseGroupsPartition(
  groups: readonly DiseaseGroup[],
): void {
  const ids = new Set<string>();
  const owner = new Map<string, string>();

  for (const { id, reportCodes } of groups) {
    if (ids.has(id)) {
      throw new Error(`Disease group id "${id}" is used twice`);
    }
    ids.add(id);
    if (reportCodes.length === 0) {
      throw new Error(`Disease group "${id}" has no Report codes`);
    }
    for (const code of reportCodes) {
      const other = owner.get(code);
      if (other !== undefined) {
        throw new Error(
          `Report code ${code} is in both "${other}" and "${id}"`,
        );
      }
      owner.set(code, id);
    }
  }
}
