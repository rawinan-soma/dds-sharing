import { safeReturnTo, signInQueryFor } from './return-to';

describe('return-to address', () => {
  it('accepts a path inside the reviewer surface', () => {
    expect(safeReturnTo('/reviewer/queue')).toBe('/reviewer/queue');
    expect(safeReturnTo('/reviewer')).toBe('/reviewer');
    expect(safeReturnTo('/reviewer/request/REQ-2569-0142?tab=1')).toBe(
      '/reviewer/request/REQ-2569-0142?tab=1',
    );
  });

  it.each([
    null,
    undefined,
    '',
    'https://evil.example/reviewer',
    '//evil.example/reviewer',
    '/\\evil.example',
    '/somewhere-else',
    '/reviewerx',
    'reviewer/queue',
    '/reviewer/../admin',
  ])('falls back to the surface root for %j', (value) => {
    expect(safeReturnTo(value as string | null | undefined)).toBe('/reviewer');
  });

  it('never returns to the sign-in or the password gate themselves', () => {
    expect(safeReturnTo('/reviewer/sign-in')).toBe('/reviewer');
    expect(safeReturnTo('/reviewer/sign-in?returnTo=%2Freviewer')).toBe(
      '/reviewer',
    );
    expect(safeReturnTo('/reviewer/password')).toBe('/reviewer');
  });

  it('builds the sign-in query from where the Reviewer was', () => {
    expect(signInQueryFor('/reviewer/request/REQ-1')).toEqual({
      returnTo: '/reviewer/request/REQ-1',
    });
  });

  it('leaves the query empty when there is nowhere worth returning to', () => {
    expect(signInQueryFor('/reviewer')).toEqual({});
    expect(signInQueryFor('/reviewer/sign-in')).toEqual({});
    expect(signInQueryFor('/')).toEqual({});
  });
});
