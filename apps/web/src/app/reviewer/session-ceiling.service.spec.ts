import { TestBed } from '@angular/core/testing';
import { SessionCeilingService } from './session-ceiling.service';

describe('SessionCeilingService (spec §17.5: session-ceiling warning and expiry)', () => {
  function setup() {
    TestBed.configureTestingModule({});
    return TestBed.inject(SessionCeilingService);
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show a warning before T-minus-5-minutes', () => {
    const service = setup();
    const absoluteExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    service.start(absoluteExpiresAt, vi.fn());

    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(service.warningVisible()).toBe(false);
  });

  it('shows a non-blocking warning exactly at T-minus-5-minutes', () => {
    const service = setup();
    const absoluteExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    service.start(absoluteExpiresAt, vi.fn());

    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(service.warningVisible()).toBe(true);
  });

  it('calls onExpire and hides the warning when the ceiling is reached', () => {
    const service = setup();
    const onExpire = vi.fn();
    const absoluteExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    service.start(absoluteExpiresAt, onExpire);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(service.warningVisible()).toBe(false);
  });

  it('shows the warning immediately when started less than 5 minutes from the ceiling', () => {
    const service = setup();
    const absoluteExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    service.start(absoluteExpiresAt, vi.fn());

    expect(service.warningVisible()).toBe(true);
  });

  it('never fires based on idle time alone — only the timers set by start() drive it', () => {
    const service = setup();
    const onExpire = vi.fn();
    // No start() call at all: advancing time must never trigger anything.
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(onExpire).not.toHaveBeenCalled();
    expect(service.warningVisible()).toBe(false);
  });

  it('stop() clears pending timers so neither the warning nor onExpire fires later', () => {
    const service = setup();
    const onExpire = vi.fn();
    const absoluteExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    service.start(absoluteExpiresAt, onExpire);

    service.stop();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(service.warningVisible()).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('starting again replaces any previously scheduled timers', () => {
    const service = setup();
    const firstOnExpire = vi.fn();
    const secondOnExpire = vi.fn();
    service.start(new Date(Date.now() + 10 * 60 * 1000).toISOString(), firstOnExpire);
    service.start(new Date(Date.now() + 20 * 60 * 1000).toISOString(), secondOnExpire);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(firstOnExpire).not.toHaveBeenCalled();
    expect(secondOnExpire).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(secondOnExpire).toHaveBeenCalledTimes(1);
  });
});
