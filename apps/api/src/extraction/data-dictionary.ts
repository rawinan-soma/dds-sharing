import { createHash } from "node:crypto";
import { DATA_DICTIONARY_CSV } from "../reference-data/data-dictionary.generated.js";

/**
 * The fixed filename the Data dictionary is copied into every Extract
 * archive under (spec §8.2 rule 8, §8.3) — never the reference number,
 * never derived from the Request.
 */
export const DATA_DICTIONARY_FILENAME = "data-dictionary.csv";

/**
 * Identical in every archive ever produced (spec §8.2 rule 8): the content
 * is embedded at build time from `docs/data-dictionary.csv`
 * (`scripts/generate-data-dictionary.ts`), never read from disk at
 * request time, so there is nothing here for a running job to disagree
 * with itself about.
 */
export function getDataDictionaryBytes(): Buffer {
  return Buffer.from(DATA_DICTIONARY_CSV, "utf8");
}

/**
 * A reference-data checksum (spec §7.9, §8.4) — sits *beside* the Extract
 * fingerprint on `job_completed`, never inside it: this describes what
 * *made* the Extract, not what was released.
 */
export function computeDataDictionaryChecksum(bytes: Buffer = getDataDictionaryBytes()): string {
  return createHash("sha256").update(bytes).digest("hex");
}
