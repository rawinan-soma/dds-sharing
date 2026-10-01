import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { B } from './b-tokens';

const systemMd = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../docs/design/system.md',
  ),
  'utf-8',
);

// The "Colour" table: | `name` | `#value` | …
function colourTable(): Record<string, string> {
  const rows = [
    ...systemMd.matchAll(/^\| `([a-z-]+)` \| `(#[0-9a-f]{6})` \|/gm),
  ];
  return Object.fromEntries(rows.map(([, name, value]) => [name, value]));
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

  it('reads both token tables from system.md', () => {
    expect(documented).toMatchObject({
      background: '#e4e6ea',
      'pending-wash': '#fdf3dc',
    });
  });

  it('holds every token at the value system.md gives it', () => {
    const named = Object.entries(B).filter(([name]) => name !== 'quiet');
    for (const [name, value] of named) {
      expect([kebab(name), value]).toEqual([
        kebab(name),
        documented[kebab(name)],
      ]);
    }
  });

  it('carries every documented token but the retired on-dark pair', () => {
    const carried = new Set(Object.keys(B).map(kebab));
    const missing = Object.keys(documented).filter(
      (name) => !carried.has(name),
    );
    expect(missing).toEqual([]);
  });

  it('takes the quiet grey from the screens that draw it', () => {
    expect(systemMd).toContain(`\`${B.quiet}\``);
  });
});
