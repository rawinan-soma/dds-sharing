import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";
import appConfig from "./config/app.config.js";
import transportConfig from "./config/transport.config.js";
import smtpConfig from "./config/smtp.config.js";
import { activeInsecureFlags } from "./config/insecure-flags.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const logger = new Logger("Bootstrap");
  const transport = app.get(transportConfig.KEY);
  const smtp = app.get(smtpConfig.KEY);
  for (const flag of activeInsecureFlags(transport, smtp)) {
    logger.warn(`${flag} is enabled — this deployment is running without TLS for it (ADR 0018).`);
  }

  const { port } = app.get(appConfig.KEY);
  await app.listen(port);
}
await bootstrap();
