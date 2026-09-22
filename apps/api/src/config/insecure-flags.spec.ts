import { ConsoleLogger, Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeInsecureFlags, InsecureFlags } from './insecure-flags';

const flags = (allowInsecureTransport: boolean, allowPlaintext: boolean) =>
  new InsecureFlags({ allowInsecureTransport }, {
    allowPlaintext,
  } as ConstructorParameters<typeof InsecureFlags>[1]);

describe('the insecure flags', () => {
  // Not the console: the spec asserts on the calls, and prints nothing.
  beforeEach(() => Logger.overrideLogger(false));
  afterEach(() => {
    Logger.overrideLogger(new ConsoleLogger());
    vi.restoreAllMocks();
  });

  it('are none when both are off', () => {
    expect(
      activeInsecureFlags(
        { allowInsecureTransport: false },
        { allowPlaintext: false },
      ),
    ).toEqual([]);
  });

  it.each([
    [true, false, ['ALLOW_INSECURE_TRANSPORT']],
    [false, true, ['SMTP_ALLOW_PLAINTEXT']],
    [true, true, ['ALLOW_INSECURE_TRANSPORT', 'SMTP_ALLOW_PLAINTEXT']],
  ])('name what is on: %s %s', (transport, plaintext, expected) => {
    expect(flags(transport, plaintext).active).toEqual(expected);
  });

  it('log one WARN per flag that is on, naming it', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation();
    flags(true, true).onApplicationBootstrap();

    const lines = warn.mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('ALLOW_INSECURE_TRANSPORT');
    expect(lines[1]).toContain('SMTP_ALLOW_PLAINTEXT');
  });

  it('log nothing when both are off', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation();
    flags(false, false).onApplicationBootstrap();
    expect(warn).not.toHaveBeenCalled();
  });
});
