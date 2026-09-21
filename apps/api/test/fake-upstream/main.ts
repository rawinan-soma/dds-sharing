// Runs the fake upstream for development:
//
//   pnpm --filter api run fake-upstream -- --fault=server-error --rows=25000
//
// then point the service at it:
//
//   UPSTREAM_BASE_URL=http://127.0.0.1:4010/api/d506/v1
//   UPSTREAM_TOKEN=fake-upstream-token
//
// Synthetic data only. See fake-upstream.ts.

import { createFakeUpstream, DEFAULT_TOKEN, Fault } from './fake-upstream';

const FAULTS: Record<string, Fault> = {
  'server-error': { kind: 'server-error', page: 2, times: 1 },
  'slow-page': { kind: 'slow-page', page: 1, delayMs: 65_000, times: 1 },
  'truncated-page': { kind: 'truncated-page', page: 1, times: 1 },
  'auth-expiry': { kind: 'auth-expiry', afterRequests: 2 },
  'shifting-total': { kind: 'shifting-total' },
};

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const faultName = flag('fault');
  if (faultName !== undefined && !(faultName in FAULTS)) {
    throw new Error(
      `Unknown --fault=${faultName}. One of: ${Object.keys(FAULTS).join(', ')}`,
    );
  }
  const upstream = await createFakeUpstream({
    port: Number(flag('port') ?? 4010),
    rowsPerCode: Number(flag('rows') ?? 25_000),
  });
  if (faultName) upstream.setFault(FAULTS[faultName]);
  console.log(`fake upstream on ${upstream.url}`);
  console.log(`token: ${DEFAULT_TOKEN}`);
  console.log(`fault: ${faultName ?? 'none'}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
