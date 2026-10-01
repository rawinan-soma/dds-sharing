import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { apiPath } from '../src/repo-paths';

export default defineConfig({
  root: apiPath(),
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    include: ['test/**/*.e2e-spec.ts'],
  },
});
