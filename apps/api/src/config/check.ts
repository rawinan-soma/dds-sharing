import { httpAppSchema, validateEnvOrExit } from './env.schema';

// `node dist/config/check.js`: the HTTP app's whole environment, checked before
// the image migrates anything. The migration runner validates only
// DATABASE_URL, so without this a missing SMTP_PASS would surface only after the
// schema had already changed.
validateEnvOrExit(httpAppSchema);
