import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReviewerShell } from './reviewer-shell';

describe('ReviewerShell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ReviewerShell],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
  });

  const robots = () => document.head.querySelector('meta[name=robots]');

  it('keeps the surface out of search results while it is on screen', async () => {
    const fixture = TestBed.createComponent(ReviewerShell);
    await fixture.whenStable();
    expect(robots()?.getAttribute('content')).toMatch(/noindex/);

    fixture.destroy();
    expect(robots()).toBeNull();
    TestBed.inject(HttpTestingController).match(() => true);
  });

  it('asks the server for the session on arrival, which also hands over the CSRF token', async () => {
    const fixture = TestBed.createComponent(ReviewerShell);
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/reviewer/session').flush({ authenticated: false });
  });
});
