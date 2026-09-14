import { fileURLToPath } from "node:url";

// The built Angular SPA output, served as static assets by app.module.ts and
// as the SPA-fallback shell for unmatched client routes by spa-fallback.ts.
export const WEB_DIST_PATH = fileURLToPath(new URL("../../web/dist/web/browser", import.meta.url));
