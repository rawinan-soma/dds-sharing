import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

// Duplicate suppression is keyed on the client IP (§4.8), so behind a proxy the
// application must be told how many hops to believe, or every Requester shares
// the edge's address and the second person to submit is refused. Unset, nobody is
// believed: a header a client can forge is never read as an address.
// `true`, a hop count, or an Express trust-proxy subnet list.
function trustProxy(value: string | undefined): boolean | number | string {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.set('trust proxy', trustProxy(process.env.TRUST_PROXY));
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
