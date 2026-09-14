import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Every e2e file's beforeEach truncates request/request_event assuming
    // it owns the shared Postgres exclusively — and the IP-scoped duplicate-
    // submission guard (requests.service.ts) has no per-file isolation. Two
    // files posting to /api/requests concurrently race that guard. Run
    // files sequentially rather than each spec managing its own IP/identity.
    fileParallelism: false,
  },
});
