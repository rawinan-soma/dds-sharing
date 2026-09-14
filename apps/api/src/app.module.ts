import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { HealthModule } from "./health/health.module.js";
import { HEALTH_PATHS } from "./health/health-paths.js";
import { ApiNotFoundModule } from "./api-not-found.module.js";
import { ReferenceDataModule } from "./reference-data/reference-data.module.js";
import { AppDbModule } from "./db/app-db.module.js";
import { RequestsModule } from "./requests/requests.module.js";
import { ReviewerModule } from "./auth/reviewer.module.js";
import { WEB_DIST_PATH } from "./web-dist-path.js";

const staticExclude = new RegExp(
  `^/(api|${HEALTH_PATHS.map((path) => path.replace(/\//g, "\\/")).join("|")})(/.*)?$`,
);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: WEB_DIST_PATH,
      exclude: staticExclude,
    }),
    HealthModule,
    ReferenceDataModule,
    AppDbModule,
    RequestsModule,
    ReviewerModule,
    // Last, deliberately (see api-not-found.module.ts): its catch-all must
    // register after every feature module's routes, or it swallows them.
    ApiNotFoundModule,
  ],
})
export class AppModule {}
