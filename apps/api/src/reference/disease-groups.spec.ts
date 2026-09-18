import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DISEASE_GROUPS,
  assertDiseaseGroupsPartition,
  diseaseGroupOfReportCode,
  type DiseaseGroup,
} from './disease-groups';

const docs = join(dirname(fileURLToPath(import.meta.url)), '../../../../docs');
const read = (path: string) => readFileSync(join(docs, path), 'utf-8');

// The Report code seed: every `group_code` row of the code list in
// docs/research/003-disease-group-codes.md. Stops before the companion-ICD
// notes and never reads the amendment table above the list, which names codes
// this service deliberately does not serve.
function seedReportCodes(): string[] {
  const doc = read('research/003-disease-group-codes.md');
  const list = doc.slice(
    doc.indexOf('## The code list'),
    doc.indexOf('### `รหัส ICD-10 ร่วม`'),
  );
  return [...list.matchAll(/^\| (\d+) \|/gm)].map((m) => m[1]);
}

// The picker table of docs/disease-groups.md: `| # | id | name | codes |`.
function classificationFromDoc(): DiseaseGroup[] {
  return [
    ...read('disease-groups.md').matchAll(
      /^\| \d+ \| `([^`]+)` \| (.+?) \| ([\d, ]+) \|$/gm,
    ),
  ].map(([, id, name, codes]) => ({
    id,
    name,
    reportCodes: codes.split(',').map((c) => c.trim()),
  }));
}

describe('the Disease group classification', () => {
  // §17.1: the groups cover every Report code in the seed exactly once.
  //
  // KNOWN BLIND SPOT — read before trusting this test. It compares the
  // classification against the *seed* (docs/research/003-disease-group-codes.md),
  // so it is structurally blind to a Report code that exists upstream and is
  // missing from the seed (#33 is exactly that case: the general D506 block
  // shares this endpoint). Nothing automated closes that gap and nothing should
  // pretend to — probing unenumerated codes would hit production upstream on
  // every CI run or be permanently skipped. The real control is the periodic
  // human re-probe (spec §17.1), done once a year or on any DDC announcement.
  it('partitions the seed Report codes: none missing, none repeated', () => {
    const seed = seedReportCodes();
    const grouped = DISEASE_GROUPS.flatMap((g) => g.reportCodes);

    expect(seed.length).toBeGreaterThan(0);
    expect(new Set(seed).size).toBe(seed.length);
    expect(grouped.toSorted()).toEqual(seed.toSorted());
  });

  it('is exactly the classification in docs/disease-groups.md', () => {
    expect(DISEASE_GROUPS).toEqual(classificationFromDoc());
  });

  it('gives each group a stable id that is not its name', () => {
    expect(DISEASE_GROUPS).toHaveLength(10);
    for (const { id, name } of DISEASE_GROUPS) {
      expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(id).not.toBe(name);
    }
    expect(new Set(DISEASE_GROUPS.map((g) => g.id)).size).toBe(10);
  });

  it('finds the group of a Report code outside the EnvOcc block', () => {
    expect(diseaseGroupOfReportCode('501')?.id).toBe('heat');
    expect(diseaseGroupOfReportCode('220')?.id).toBe('work-related');
    expect(diseaseGroupOfReportCode('502')).toBeUndefined();
  });
});

describe('assertDiseaseGroupsPartition', () => {
  const group = (id: string, ...reportCodes: string[]): DiseaseGroup => ({
    id,
    name: id,
    reportCodes,
  });

  it('accepts a partition', () => {
    expect(() =>
      assertDiseaseGroupsPartition([group('a', '201'), group('b', '501')]),
    ).not.toThrow();
  });

  it('rejects a Report code in two groups', () => {
    expect(() =>
      assertDiseaseGroupsPartition([group('a', '201'), group('b', '201')]),
    ).toThrow(/201/);
  });

  it('rejects a duplicated group id', () => {
    expect(() =>
      assertDiseaseGroupsPartition([group('a', '201'), group('a', '202')]),
    ).toThrow(/"a"/);
  });

  it('rejects an empty group', () => {
    expect(() => assertDiseaseGroupsPartition([group('a')])).toThrow(/"a"/);
  });
});
