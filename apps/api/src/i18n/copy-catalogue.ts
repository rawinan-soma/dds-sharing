import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The copy catalogue, read directly from the JSON files (spec §16.3, ADR
// 0010) rather than through Paraglide: Paraglide has no Node/Nest adapter, and
// these files are already the source of truth `copy-catalogue.spec.ts`
// checks. Both the four NestJS emails and the two server-rendered pages
// (`/d/<token>`, `/link-expired`) read through this one module.
//
// The served language is whatever `project.inlang/settings.json`'s
// `baseLocale` names — not a hardcoded locale. Today that is `"en"` (ADR
// 0010's development matrix; the flip to Thai-only is #96), so this reader
// automatically starts serving Thai the moment that file flips, with no code
// change here.

interface ProjectSettings {
  baseLocale: string;
}

export interface Catalogue {
  locale: string;
  t(key: string, params?: Record<string, string | number>): string;
}

/** Replaces every `{name}` in `template` found in `params`; leaves the rest untouched. */
export function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match,
  );
}

/** `root` holds `project.inlang/settings.json` and `messages/` as siblings, exactly as the repo root does. */
export function loadCatalogue(root: string): Catalogue {
  const settings = JSON.parse(
    readFileSync(join(root, 'project.inlang/settings.json'), 'utf-8'),
  ) as ProjectSettings;
  const locale = settings.baseLocale;
  const messages = JSON.parse(
    readFileSync(join(root, 'messages', `${locale}.json`), 'utf-8'),
  ) as Record<string, unknown>;

  return {
    locale,
    t(key, params) {
      const template = messages[key];
      if (typeof template !== 'string') {
        throw new Error(
          `copy catalogue: missing key "${key}" in ${locale}.json`,
        );
      }
      return interpolate(template, params);
    },
  };
}

// apps/api/src/i18n -> repo root is four levels up. `__dirname` (not
// `import.meta.url`) because this file compiles into CommonJS output
// (`nest build`), unlike the `.spec.ts` files vitest transforms as ESM.
const REPO_ROOT = join(__dirname, '../../../..');

/** The app-wide singleton, reading the real repository's catalogue. */
export const catalogue: Catalogue = loadCatalogue(REPO_ROOT);
