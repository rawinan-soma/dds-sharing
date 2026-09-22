import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { BOM } from '../src/extraction/extract-writer';

// docs/data-dictionary.csv stays canonical, plain LF, no BOM — a normal
// checked-in text file. What ships inside every Extract archive is generated
// from it (spec §8.2 rule 8): CRLF line endings and a UTF-8 BOM, for the same
// Excel audience as the Extract itself, though this file is never
// fingerprinted (only the Extract is, spec §8.4).

const apiRoot = join(__dirname, '..');
const source = readFileSync(
  join(apiRoot, '../../docs/data-dictionary.csv'),
  'utf-8',
);
const withCrlf = source.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
const bytes = Buffer.concat([BOM, Buffer.from(withCrlf, 'utf-8')]);
const checksum = createHash('sha256').update(bytes).digest('hex');

const out = `// Generated from docs/data-dictionary.csv by \`pnpm generate:data-dictionary\`.
// Do not edit. What every Extract archive's Data dictionary entry is (spec
// §8.2 rule 8): the checked-in CSV, with CRLF line endings and a UTF-8 BOM.
export const DATA_DICTIONARY_FILENAME = 'data-dictionary.csv';
export const DATA_DICTIONARY_BYTES_BASE64 =
  '${bytes.toString('base64')}';
export const DATA_DICTIONARY_CHECKSUM =
  '${checksum}';
`;

writeFileSync(
  join(apiRoot, 'src/extraction/data-dictionary.generated.ts'),
  out,
);
console.log(
  `Generated the Data dictionary (${bytes.length} bytes, sha256 ${checksum}).`,
);
