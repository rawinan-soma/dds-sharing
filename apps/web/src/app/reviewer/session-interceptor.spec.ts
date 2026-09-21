import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReviewerSession } from './reviewer-session';
import { reviewerSessionInterceptor } from './session-interceptor';

describe('reviewerSessionInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let ended: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([reviewerSessionInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    ended = vi
      .spyOn(TestBed.inject(ReviewerSession), 'endedByServer')
      .mockImplementation(() => undefined);
  });

  const refuse = (url: string, error: string) => {
    http.get(url).subscribe({ error: () => undefined });
    backend.expectOne(url).flush({ error }, { status: 401, statusText: 'x' });
  };

  it.each(['session_expired', 'unauthenticated'])(
    'ends the session when a Reviewer call is refused as %s',
    (error) => {
      refuse('/api/reviewer/queue', error);
      expect(ended).toHaveBeenCalledOnce();
    },
  );

  it('leaves a wrong password on the credential calls alone', () => {
    refuse('/api/reviewer/sign-in', 'sign_in_failed');
    refuse('/api/reviewer/password', 'sign_in_failed');
    expect(ended).not.toHaveBeenCalled();
  });

  it('ignores a 401 that is not the Reviewer API', () => {
    refuse('/api/other', 'unauthenticated');
    expect(ended).not.toHaveBeenCalled();
  });
});
