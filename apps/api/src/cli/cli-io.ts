import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hostCliSchema, validateEnvOrExit } from '../config/env.schema';
import { type Db } from '../db/database.module';

// What a host command writes to; the entry script binds it to the terminal and
// a spec to arrays.
export interface CliOutput {
  out(line: string): void;
  err(line: string): void;
}

export interface CliIo extends CliOutput {
  prompt(question: string): Promise<string>;
}

export const terminalOutput: CliOutput = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

/** Runs a host command's `main`, turning its result into the exit code. */
export function runMain(main: () => Promise<number>): void {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    },
  );
}

/** parseArgs's own errors (unknown flag, missing value) read well as they are. */
export function isArgumentError(error: unknown): error is TypeError {
  return error instanceof TypeError && 'code' in error;
}

/**
 * Runs `use` against the database as the application role, like the app, so
 * the grants in the migrations bind a host command too.
 */
export async function withAppDb<T>(use: (db: Db) => Promise<T>): Promise<T> {
  const { APP_DATABASE_URL: connectionString } =
    validateEnvOrExit(hostCliSchema);
  const pool = new Pool({ connectionString });
  try {
    return await use(drizzle(pool));
  } finally {
    await pool.end();
  }
}

/** `1 Request`, `2 Requests`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
