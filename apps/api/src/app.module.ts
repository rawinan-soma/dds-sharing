import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { fileURLToPath } from "node:url";
import { HealthModule } from "./health/health.module.js";
import { HEALTH_PATHS } from "./health/health-paths.js";
import { ApiNotFoundModule } from "./api-not-found.module.js";
import { ReferenceDataModule } from "./reference-data/reference-data.module.js";
import { ReviewerModule } from "./auth/reviewer.module.js";

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
    ReviewerModule,
    // Must stay last — see api-not-found.module.ts for why.
    ApiNotFoundModule,
  ],
})
export class AppModule {}
