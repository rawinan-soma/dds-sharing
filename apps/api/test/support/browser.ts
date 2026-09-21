/* eslint-disable @typescript-eslint/no-unsafe-assignment --
   rows from pg and JSON bodies over HTTP are untyped by nature; the assertions are the types. */
import request from 'supertest';
import { type App } from 'supertest/types';

export interface Reply {
  status: number;
  body: any;
  headers: Record<string, any>;
  setCookies: string[];
}

// A cookie jar that ignores `Secure`, so the flag can be asserted on the header
// while the test still talks plain http, as the dev stack does.
export class Browser {
  private jar = new Map<string, string>();

  constructor(
    private readonly server: App,
    private readonly userAgent = 'test-browser/1.0',
  ) {}

  cookie(name: string): string | undefined {
    return this.jar.get(name);
  }

  forget(name: string) {
    this.jar.delete(name);
  }

  async send(
    method: 'get' | 'post',
    path: string,
    body?: unknown,
    options: { csrf?: boolean } = {},
  ): Promise<Reply> {
    let req = request(this.server)
      [method](path)
      .set('User-Agent', this.userAgent);
    const cookies = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookies) req = req.set('Cookie', cookies);
    const csrf = this.jar.get('reviewer_csrf');
    if (method === 'post' && csrf && options.csrf !== false) {
      req = req.set('X-CSRF-Token', csrf);
    }
    if (body !== undefined) req = req.send(body as object);
    const res = await req;

    const setCookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    for (const line of setCookies) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      if (/expires=thu, 01 jan 1970/i.test(line) || value === '') {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
    return {
      status: res.status,
      body: res.body,
      headers: res.headers,
      setCookies,
    };
  }

  get(path: string) {
    return this.send('get', path);
  }

  post(path: string, body?: unknown, options?: { csrf?: boolean }) {
    return this.send('post', path, body ?? {}, options);
  }
}

/** A clock the test moves by hand. */
export class TestClock {
  constructor(private ms: number) {}
  now() {
    return new Date(this.ms);
  }
  advance(ms: number) {
    this.ms += ms;
  }
}
