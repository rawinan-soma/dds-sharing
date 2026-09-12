import { INestApplication, RequestMethod } from "@nestjs/common";
import cookieParser from "cookie-parser";
import type { NextFunction, Request, Response } from "express";
import { HEALTH_PATHS } from "./health/health-paths.js";

export function configureApp(app: INestApplication) {
  app.use(cookieParser());

  // The reviewer surface is not linked from the public app and is kept out
  // of search results — tidiness, not security (spec §17.4): the header is
  // sent for both the SPA shell at `/reviewer` and its `/api/reviewer/*`
  // endpoints, and claims nothing about the URL being secret.
  const isReviewerSurfacePath = (path: string) =>
    path === "/reviewer" ||
    path.startsWith("/reviewer/") ||
    path === "/api/reviewer" ||
    path.startsWith("/api/reviewer/");
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (isReviewerSurfacePath(req.path)) {
      res.setHeader("X-Robots-Tag", "noindex");
    }
    next();
  });

  app.setGlobalPrefix("api", {
    exclude: HEALTH_PATHS.map((path) => ({ path, method: RequestMethod.ALL })),
  });
  return app;
}
