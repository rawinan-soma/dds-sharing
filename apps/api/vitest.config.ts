import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Reviewer auth specs (ticket #64) TRUNCATE shared tables — reviewer,
    // reviewer_event, reviewer_session, reviewer_login_throttle — between
    // tests, and several assert *global* invariants (the two-active-reviewer
    // floor) over the whole table. Running spec files in parallel against
    // the one shared DATABASE_URL would let one file's TRUNCATE or INSERT
    // race another's, so files run sequentially in this project.
    fileParallelism: false,
  },
});
