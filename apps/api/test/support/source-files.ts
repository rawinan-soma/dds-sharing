import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every production `.ts` file under `dir` — specs excluded — for tripwire specs that read the source. */
export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}
