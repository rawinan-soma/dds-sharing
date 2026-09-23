import { type Client, type LifecycleConfig } from 'minio';

/*
 * The MinIO lifecycle rule is the BACKSTOP only (spec §9.5). The tick deletes
 * every object at its token's expiry and writes `object_deleted`; this rule
 * exists for when that job is broken or the box was down. It deletes silently
 * — no record, and a token row still asserting an Extract that is gone — so
 * the evidence the data does not linger is the application's deletion record,
 * never this configuration.
 *
 * ⚠️ 3 days is 72 hours: the same as the Download token's life, so the
 * invariant *lifecycle ≥ token expiry* holds by EQUALITY, with no slack. That
 * is safe ONLY because S3/MinIO lifecycle expiration is evaluated in whole
 * days, from object creation, rounded up and applied on a periodic scan — so
 * it fires at or after the boundary, never early, and a live token can never
 * point at an object the backstop already removed. (The object is uploaded a
 * moment before the job completes and the token's 72 hours start; the day
 * rounding and the scan are what cover those seconds.)
 *
 * If this rule is ever expressed in a unit finer than days, or measured from
 * anything other than object creation, that guarantee is gone and the rule
 * must go back ABOVE the token expiry. "72 and 72" is not a tidy coincidence.
 */
export const EXTRACT_BACKSTOP_DAYS = 3;

export const EXTRACT_BACKSTOP: LifecycleConfig = {
  Rule: [
    {
      ID: 'extract-backstop',
      Status: 'Enabled',
      Filter: { Prefix: '' },
      Expiration: { Days: EXTRACT_BACKSTOP_DAYS },
    },
  ],
};

type BucketClient = Pick<
  Client,
  'bucketExists' | 'makeBucket' | 'setBucketLifecycle'
>;

/** Makes the Extract bucket if it is missing, and (re)applies the backstop. The tick runs it until it succeeds once per process. */
export async function prepareExtractBucket(
  client: BucketClient,
  bucket: string,
): Promise<void> {
  if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);
  await client.setBucketLifecycle(bucket, EXTRACT_BACKSTOP);
}
