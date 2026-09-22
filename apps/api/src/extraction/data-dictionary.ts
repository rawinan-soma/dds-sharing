// The static Thai/English Data dictionary (spec §8.2 rule 8): identical in
// every Extract archive, a property of the service, never of the Request.
// The bytes and checksum are generated from docs/data-dictionary.csv by
// `pnpm generate:data-dictionary` — never hand-edit `*.generated.ts`.

import {
  DATA_DICTIONARY_BYTES_BASE64,
  DATA_DICTIONARY_CHECKSUM,
  DATA_DICTIONARY_FILENAME,
} from './data-dictionary.generated';

export const DATA_DICTIONARY_BYTES = Buffer.from(
  DATA_DICTIONARY_BYTES_BASE64,
  'base64',
);
export { DATA_DICTIONARY_CHECKSUM, DATA_DICTIONARY_FILENAME };
