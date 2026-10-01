import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { apiPath, repoPath } from './repo-paths';

describe('repo paths', () => {
  it('finds the repository root', () => {
    expect(existsSync(repoPath('project.inlang/settings.json'))).toBe(true);
    expect(existsSync(repoPath('docs/design/system.md'))).toBe(true);
  });

  it('finds the api package', () => {
    expect(existsSync(apiPath('src/repo-paths.ts'))).toBe(true);
  });
});
