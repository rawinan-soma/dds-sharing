import { readFileSync } from 'node:fs';
import { repoPath } from '../repo-paths';
import { describe, expect, it } from 'vitest';
import { B, DRAWN } from './b-tokens';

const systemMd = readFileSync(repoPath('docs/design/system.md'), 'utf-8');

// system.md retires these but still lists them.
const RETIRED = ['on-dark', 'on-dark-muted'];

// The "Colour" table: | `name` | `#value` | …, or a pair of each joined by " / ".
function colourTable(): Record<string, string> {
  const rows = [
    ...systemMd.matchAll(
      /^\| `([a-z-]+)`(?: \/ `([a-z-]+)`)? \| `(#[0-9a-f]{6})`(?: \/ `(#[0-9a-f]{6})`)? \|/gm,
    ),
  ];
  return Object.fromEntries(
    rows.flatMap(([, name, pairName, value, pairValue]) =>
      pairName
        ? [
            [name, value],
            [pairName, pairValue],
          ]
        : [[name, value]],
    ),
  );
}

// The "State" table: | `state` | `#ink` | `#wash` | …
function stateTable(): Record<string, string> {
  const rows = [
    ...systemMd.matchAll(
      /^\| `([a-z]+)` \| `(#[0-9a-f]{6})` \| `(#[0-9a-f]{6})` \|/gm,
    ),
  ];
  return Object.fromEntries(
    rows.flatMap(([, name, ink, wash]) => [
      [name, ink],
      [`${name}-wash`, wash],
    ]),
  );
}

const kebab = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('B tokens (docs/design/system.md)', () => {
  const documented = { ...colourTable(), ...stateTable() };

  it('reads both token tables from system.md, the retired pair included', () => {
    expect(documented).toMatchObject({
      background: '#e4e6ea',
      'on-dark-muted': '#a9adb6',
      'pending-wash': '#fdf3dc',
    });
  });

  it('holds every token at the value system.md gives it', () => {
    for (const [name, value] of Object.entries(B)) {
      expect([kebab(name), value]).toEqual([
        kebab(name),
        documented[kebab(name)],
      ]);
    }
  });

  it('carries every documented token but the retired pair', () => {
    const carried = new Set(Object.keys(B).map(kebab));
    const missing = Object.keys(documented).filter(
      (name) => !carried.has(name) && !RETIRED.includes(name),
    );
    expect(missing).toEqual([]);
    expect(RETIRED.filter((name) => carried.has(name))).toEqual([]);
  });

  it('takes the band grey from the screens that draw it', () => {
    expect(systemMd).toContain(`\`${DRAWN.bandGrey}\``);
  });
});
