// The unauthenticated, unprefixed health routes (§16.2). Shared by
// configure-app.ts (excluding them from the /api prefix) and app.module.ts
// (excluding them from the SPA static handler) so the two stay in sync.
export const HEALTH_PATHS = ["health", "health/scheduler"] as const;
