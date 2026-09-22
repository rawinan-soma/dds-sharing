import { fileURLToPath } from 'node:url';

// The test environment is a checked-in file, not each spec's own guess. Values
// already in the environment win, so CI overrides only the database URLs.
process.loadEnvFile(fileURLToPath(new URL('../.env.test', import.meta.url)));
