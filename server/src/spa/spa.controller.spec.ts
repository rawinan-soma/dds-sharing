import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SpaController } from './spa.controller.js';
import { AppConfigService } from '../config/app-config.service.js';

function fakeResponse() {
  return { sentFile: undefined as string | undefined, sendFile(path: string) { this.sentFile = path; } };
}

describe('SpaController', () => {
  let controller: SpaController;

  beforeEach(async () => {
    process.env.BASE_URL = 'https://example.test';
    process.env.DATABASE_URL = 'postgres://example';
    process.env.STATIC_ROOT = '/web-dist';

    const moduleRef = await Test.createTestingModule({
      controllers: [SpaController],
      providers: [AppConfigService],
    }).compile();

    controller = moduleRef.get(SpaController);
  });

  it('serves index.html for an Angular route', () => {
    const res = fakeResponse();
    controller.serveFallback({ path: '/reviewer/queue' } as never, res as never);
    expect(res.sentFile).toBe('/web-dist/index.html');
  });

  it.each(['/api', '/api/requests', '/health', '/health/scheduler', '/d', '/d/some-token'])(
    'never swallows the reserved path %s',
    (path) => {
      const res = fakeResponse();
      expect(() => controller.serveFallback({ path } as never, res as never)).toThrow(NotFoundException);
      expect(res.sentFile).toBeUndefined();
    },
  );

  it('does not treat a route that merely starts with a reserved word as reserved', () => {
    const res = fakeResponse();
    controller.serveFallback({ path: '/apidocs' } as never, res as never);
    expect(res.sentFile).toBe('/web-dist/index.html');
  });
});
