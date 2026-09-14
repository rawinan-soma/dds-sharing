import type { NextFunction, Request, Response } from "express";
import { HEALTH_PATHS } from "./health/health-paths.js";

const HEALTH_ROUTE_PATHS = new Set(HEALTH_PATHS.map((path) => `/${path}`));

function isApiOrHealthPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/") || HEALTH_ROUTE_PATHS.has(path);
}

// Angular's build output only ever emits extensioned filenames (main-*.js,
// styles-*.css, favicon.ico, …); no client-side route does. Treating any
// extensioned path as "a real asset, let express.static handle it" needs no
// filesystem check — express.static already 404s a missing one — which also
// avoids re-stat'ing every asset file that spaFallback would otherwise have
// checked for existence itself before handing off.
const HAS_FILE_EXTENSION = /\.[^/]+$/;

// @nestjs/serve-static's own SPA-fallback route (auto-registered by
// ServeStaticModule) calls `res.sendFile` with an absolute path and no
// `root` option. Without `root`, the underlying `send` package dotfile-checks
// every segment of that absolute path — including any dot-prefixed ancestor
// directory the app happens to be deployed under (a CI checkout, a worktree
// path) — and 404s the whole SPA shell. Registering this middleware ahead of
// it (see configure-app.ts) means that broken fallback is never reached:
// this one passes `root`, which scopes the dotfile check to the request path
// alone, the same way express.static already does for real asset files.
export function spaFallback(webDistPath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (isApiOrHealthPath(req.path) || HAS_FILE_EXTENSION.test(req.path)) {
      next();
      return;
    }
    res.sendFile("index.html", { root: webDistPath }, (err) => {
      if (err) next(err);
    });
  };
}
