import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** §12.9: what is recorded about a Reviewer, in the catalogue's own words. */
export function loadRetentionNotice(): string[] {
  const messages = JSON.parse(
    // dist/cli or src/cli, four levels below the repository root.
    readFileSync(join(__dirname, '../../../../messages/en.json'), 'utf-8'),
  ) as Record<string, string>;
  return [
    messages.reviewer_retention_heading,
    ...[
      'reviewer_retention_signins',
      'reviewer_retention_response_times',
      'reviewer_retention_alerts',
      'reviewer_retention_display_name',
    ].map((key) => `  - ${messages[key]}`),
    messages.reviewer_retention_permanent,
  ];
}
