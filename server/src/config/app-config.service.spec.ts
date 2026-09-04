import { AppConfigService } from './app-config.service.js';

describe('AppConfigService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reads the base URL from explicit configuration', () => {
    process.env.BASE_URL = 'https://dds-sharing.example';
    process.env.DATABASE_URL = 'postgres://example';

    const config = new AppConfigService();

    expect(config.baseUrl).toBe('https://dds-sharing.example');
  });

  it('throws rather than falling back when BASE_URL is unset', () => {
    delete process.env.BASE_URL;
    process.env.DATABASE_URL = 'postgres://example';

    expect(() => new AppConfigService()).toThrow(/BASE_URL/);
  });

  it('throws rather than falling back when DATABASE_URL is unset', () => {
    process.env.BASE_URL = 'https://dds-sharing.example';
    delete process.env.DATABASE_URL;

    expect(() => new AppConfigService()).toThrow(/DATABASE_URL/);
  });
});
