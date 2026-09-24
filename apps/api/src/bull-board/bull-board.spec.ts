import { type AddressInfo } from 'node:net';
import { type Server } from 'node:http';
import { type Queue } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';
import { httpAppSchema, validateEnv } from '../config/env.schema';
import { mapApp } from '../config/namespaces';
import { listenBullBoard } from './bull-board';

// A stand-in the BullMQ adapter accepts without a Redis: rendering the
// board's shell asks a queue for nothing, and no real connection means none
// is left rejecting after the spec ends.
const fakeQueue = (name: string) =>
  ({ name, metaValues: { version: 'bullmq:5' } }) as unknown as Queue;

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>(
    (resolve) => server?.close(() => resolve()) ?? resolve(),
  );
  server = undefined;
});

describe('listenBullBoard', () => {
  it('listens on the address it is given, and nowhere else', async () => {
    server = await listenBullBoard([fakeQueue('extraction')], {
      host: '127.0.0.1',
      port: 0,
    });

    const address = server.address() as AddressInfo;
    expect(address.address).toBe('127.0.0.1');
  });

  it('serves the board at its root, with no login of its own and none of the Reviewer’s', async () => {
    server = await listenBullBoard([fakeQueue('extraction')], {
      host: '127.0.0.1',
      port: 0,
    });
    const { port } = server.address() as AddressInfo;

    const res = await fetch(`http://127.0.0.1:${port}/`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('__UI_CONFIG__');
  });
});

describe('the Bull Board bind address', () => {
  it('is loopback unless the operator sets it (spec §14.4)', () => {
    const env = { ...process.env };
    delete env.BULL_BOARD_HOST;
    delete env.BULL_BOARD_PORT;

    expect(mapApp(validateEnv(httpAppSchema, env)).bullBoard).toEqual({
      host: '127.0.0.1',
      port: 3100,
    });
  });

  it('refuses a host name: it must be an address', () => {
    expect(() =>
      validateEnv(httpAppSchema, {
        ...process.env,
        BULL_BOARD_HOST: 'localhost.example',
      }),
    ).toThrow(/BULL_BOARD_HOST must be an IP address/);
  });
});
