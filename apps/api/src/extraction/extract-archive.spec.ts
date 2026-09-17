import { describe, expect, it } from "vitest";
import type { Readable } from "node:stream";
import { fromBufferPromise, type Entry } from "yauzl";
import { buildExtractArchive } from "./extract-archive.js";

async function readAllEntries(zip: Buffer): Promise<Map<string, Buffer>> {
  // `lazyEntries: false` starts reading (and emitting "entry") synchronously
  // inside yauzl's own constructor — before `fromBufferPromise` even
  // resolves, so a listener attached after the `await` misses every event.
  // `lazyEntries: true` plus a manual `readEntry()` pump is the safe pattern.
  const zipfile = await fromBufferPromise(zip, { lazyEntries: true });
  const entries = new Map<string, Buffer>();
  await new Promise<void>((resolve, reject) => {
    zipfile.on("entry", (entry: Entry) => {
      zipfile.openReadStream(entry, (err, stream) => {
        if (err) return reject(err);
        const chunks: Buffer[] = [];
        (stream as Readable).on("data", (chunk: Buffer) => chunks.push(chunk));
        (stream as Readable).on("end", () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          zipfile.readEntry();
        });
        (stream as Readable).on("error", reject);
      });
    });
    zipfile.on("end", resolve);
    zipfile.on("error", reject);
    zipfile.readEntry();
  });
  return entries;
}

describe("buildExtractArchive (spec §8.1, §8.3)", () => {
  it("holds exactly two entries: the Extract and the Data dictionary, under their given names", async () => {
    const csv = Buffer.from("a,b,c\r\n1,2,3\r\n", "utf8");
    const dictionary = Buffer.from("column,name\r\na,A\r\n", "utf8");

    const zip = await buildExtractArchive([
      { name: "dds-envocc-sharing-20260304-171530.csv", data: csv },
      { name: "data-dictionary.csv", data: dictionary },
    ]);

    const entries = await readAllEntries(zip);
    expect([...entries.keys()].sort()).toEqual(
      ["data-dictionary.csv", "dds-envocc-sharing-20260304-171530.csv"].sort(),
    );
    expect(entries.get("dds-envocc-sharing-20260304-171530.csv")!.equals(csv)).toBe(true);
    expect(entries.get("data-dictionary.csv")!.equals(dictionary)).toBe(true);
  });
});
