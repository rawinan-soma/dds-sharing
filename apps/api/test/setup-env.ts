import { apiPath } from '../src/repo-paths';

// The test environment is a checked-in file, not each spec's own guess. Values
// already in the environment win, so CI overrides only the database URLs.
process.loadEnvFile(apiPath('.env.test'));
