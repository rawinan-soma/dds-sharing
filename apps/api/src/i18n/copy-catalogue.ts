import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoPath } from '../repo-paths';

// The copy catalogue, read directly from the JSON files (spec §16.3, ADR
// 0010) rather than through Paraglide: Paraglide has no Node/Nest adapter, and
// these files are already the source of truth `copy-catalogue.spec.ts`
// checks. Both the four NestJS emails and the two server-rendered pages
// (`/d/<token>`, `/link-expired`) read through this one module.
//
// The served language is whatever `project.inlang/settings.json`'s
// `baseLocale` names — not a hardcoded locale. Since #96 that is `"th"`;
// `messages/en.json` is still maintained beside it (ADR 0010) and is loaded
// only by naming it.

export interface ProjectSettings {
  baseLocale: string;
  locales: string[];
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

/** The locales `root`'s `project.inlang/settings.json` declares, and its base. */
export function projectLocales(root: string): ProjectSettings {
  return JSON.parse(
    readFileSync(join(root, 'project.inlang/settings.json'), 'utf-8'),
  ) as ProjectSettings;
}

/**
 * `root` holds `project.inlang/settings.json` and `messages/` as siblings,
 * exactly as the repo root does. `locale` defaults to the served base locale;
 * naming another is for tests that render a language the service does not serve.
 */
export function loadCatalogue(
  root: string,
  locale = projectLocales(root).baseLocale,
): Catalogue {
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

/** The app-wide singleton, reading the real repository's catalogue. */
export const catalogue: Catalogue = loadCatalogue(repoPath());
