import { type ObjectRange } from '../extraction/archive-store';

// A single-range `Range: bytes=...` parse (spec §9.1's range-request
// support): a dropped transfer resumes with `bytes=<offset>-`. Multi-range
// and 416 responses are out of scope — a resuming browser or curl only ever
// sends one range, and an unsatisfiable one degrades to a full response
// rather than an error.

export function parseRange(
  header: string | undefined,
  size: number,
): ObjectRange | null {
  if (!header || !header.startsWith('bytes=')) return null;
  const spec = header.slice('bytes='.length).split(',')[0].trim();
  const match = /^(\d*)-(\d*)$/.exec(spec);
  if (!match) return null;
  const [, startStr, endStr] = match;

  let start: number;
  let end: number;
  if (startStr === '') {
    // Suffix range: the last N bytes.
    if (endStr === '') return null;
    const suffixLength = Number(endStr);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(startStr);
    end = endStr === '' ? size - 1 : Math.min(Number(endStr), size - 1);
  }

  if (start > end || start < 0 || start >= size) return null;
  return { start, end };
}
