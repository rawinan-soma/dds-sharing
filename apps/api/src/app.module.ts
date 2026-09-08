import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ServeStaticModule } from "@nestjs/serve-static";
import { fileURLToPath } from "node:url";
import { HealthModule } from "./health/health.module.js";
import { HEALTH_PATHS } from "./health/health-paths.js";
import { ApiNotFoundController } from "./api-not-found.controller.js";
import { ReferenceDataModule } from "./reference-data/reference-data.module.js";

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
  ],
  controllers: [ApiNotFoundController],
})
export class AppModule {}
