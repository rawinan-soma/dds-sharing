// `/d/<token>` and `/d/<token>/archive` are excluded from the `api` global
// prefix (spec §16.2, ADR 0018): the address travels in email and must stay
// exactly `/d/<token>`, never `/api/d/<token>`. Every place that boots the
// app — `main.ts` and each e2e spec that builds its own instance — applies
// this the same way, so a bootstrap that forgets it fails loudly (a 404 on a
// route an e2e spec exercises) rather than silently prefixing the address.
export const API_PREFIX = 'api';
export const API_PREFIX_EXCLUDE = ['d/:token', 'd/:token/archive'];
