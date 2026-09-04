import { Injectable } from '@nestjs/common';
import { resolve } from 'node:path';

@Injectable()
export class AppConfigService {
  readonly port: number;
  readonly baseUrl: string;
  readonly databaseUrl: string;
  readonly staticRoot: string;
  readonly diskCheckPath: string;

  constructor() {
    this.port = Number(process.env.PORT ?? 3000);
    this.baseUrl = requireEnv('BASE_URL');
    this.databaseUrl = requireEnv('DATABASE_URL');
    // Defaults assume the workspace layout — dist/config -> ../../../web/dist/web/browser.
    // Docker sets STATIC_ROOT explicitly, per §16.2's ban on deriving serving behaviour from guesswork.
    this.staticRoot =
      process.env.STATIC_ROOT ?? resolve(import.meta.dirname, '../../../web/dist/web/browser');
    this.diskCheckPath = process.env.DISK_CHECK_PATH ?? process.cwd();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
