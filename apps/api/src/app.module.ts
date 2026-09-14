import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { fileURLToPath } from "node:url";
import { HealthModule } from "./health/health.module.js";
import { HEALTH_PATHS } from "./health/health-paths.js";
import { ApiNotFoundModule } from "./api-not-found.module.js";
import { ReferenceDataModule } from "./reference-data/reference-data.module.js";
import { AppDbModule } from "./db/app-db.module.js";
import { RequestsModule } from "./requests/requests.module.js";

const webDistPath = fileURLToPath(
  new URL("../../web/dist/web/browser", import.meta.url),
);
const staticExclude = new RegExp(
  `^/(api|${HEALTH_PATHS.map((path) => path.replace(/\//g, "\\/")).join("|")})(/.*)?$`,
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: webDistPath,
      exclude: staticExclude,
    }),
    HealthModule,
    ReferenceDataModule,
    AppDbModule,
    RequestsModule,
    // Last, deliberately (see api-not-found.module.ts): its catch-all must
    // register after every feature module's routes, or it swallows them.
    ApiNotFoundModule,
  ],
})
export class AppModule {}
