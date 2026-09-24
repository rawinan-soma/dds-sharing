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
