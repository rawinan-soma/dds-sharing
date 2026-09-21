import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    include: ['src/**/*.spec.ts', 'test/fake-upstream/**/*.spec.ts'],
  },
});
