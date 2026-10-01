import { join } from 'node:path';

// The repository and the api package, as absolute paths. `src/` and `dist/`
// sit at the same depth, so one walk serves the built app and the specs alike.
// `__dirname` (not `import.meta.url`) because this compiles into CommonJS
// output (`nest build`); vitest provides it to the specs too.
const API_ROOT = join(__dirname, '..');
const REPO_ROOT = join(API_ROOT, '../..');

/** A path given relative to the repository root. */
export function repoPath(...parts: string[]): string {
  return join(REPO_ROOT, ...parts);
}

/** A path given relative to `apps/api`. */
export function apiPath(...parts: string[]): string {
  return join(API_ROOT, ...parts);
}
