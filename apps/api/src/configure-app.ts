import { INestApplication, RequestMethod } from "@nestjs/common";
import { HEALTH_PATHS } from "./health/health-paths.js";

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api", {
    exclude: HEALTH_PATHS.map((path) => ({ path, method: RequestMethod.ALL })),
  });
  return app;
}
