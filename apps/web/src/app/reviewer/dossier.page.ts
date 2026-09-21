import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { formatDay } from '../requester/format-day';
import { type Area, type Dossier, QueueApi } from './queue-api';
import { formatDuration, formatInstant } from './queue-format';

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; dossier: Dossier }
  | { kind: 'gone' }
  | { kind: 'failed' };

// The review screen: read-only. It shows the five contact fields, the ask in
// human terms, the clock and the queue position, and only those (§10.2). The
// Approve and Reject buttons are the next slice's: they will sit BELOW all of
// this in the DOM as well as on screen, so the tab order says what the layout
// says, and they must not be floated or pinned.
@Component({
  selector: 'app-reviewer-dossier',
  template: `
    @switch (view().kind) {
      @case ('ok') {
        @if (loaded(); as d) {
          <article class="dossier">
            <header>
              <h2 #heading tabindex="-1">{{ d.reference }}</h2>
              @if (d.expired) {
                <p class="expired" role="status">{{ copy.expired }}</p>
              } @else {
                <p class="ahead">{{ ahead(d.ahead) }}</p>
              }
            </header>

            <div class="ledger">
              <section aria-labelledby="who">
                <h3 id="who">{{ copy.whoHeading }}</h3>
                <dl>
                  <dt>{{ copy.firstName }}</dt>
                  <dd>{{ d.contact.name }}</dd>
                  <dt>{{ copy.lastName }}</dt>
                  <dd>{{ d.contact.surname }}</dd>
                  <dt>{{ copy.telephone }}</dt>
                  <dd>{{ d.contact.tel }}</dd>
                  <dt>{{ copy.email }}</dt>
                  <dd>{{ d.contact.email }}</dd>
                  <dt>{{ copy.workplace }}</dt>
                  <dd>{{ d.contact.workplace }}</dd>
                </dl>
              </section>

              <section aria-labelledby="ask">
                <h3 id="ask">{{ copy.askHeading }}</h3>
                <dl>
                  <dt>{{ copy.group }}</dt>
                  <dd>
                    {{ d.diseaseGroupName }}
                    <details>
                      <summary>
                        {{ codesDisclosure(d.reportCodes.length) }}
                      </summary>
                      <p class="codes figure">{{ d.reportCodes.join(', ') }}</p>
                    </details>
                  </dd>
                  <dt>{{ copy.dates }}</dt>
                  <dd>
                    <time [attr.datetime]="d.startDate">{{
                      day(d.startDate)
                    }}</time>
                    –
                    <time [attr.datetime]="d.endDate">{{
                      day(d.endDate)
                    }}</time>
                  </dd>
                  <dt>{{ copy.area }}</dt>
                  <dd>
                    {{ areaHeadline(d.area) }}
                    @if (areaProvinces(d.area); as names) {
                      <span class="muted">{{ names }}</span>
                    }
                  </dd>
                </dl>
              </section>
            </div>

            <div class="strip">
              <div>
                <p class="cell-label">{{ copy.submitted }}</p>
                <p>
                  <time [attr.datetime]="d.submittedAt">{{
                    instant(d.submittedAt)
                  }}</time>
                </p>
              </div>
              <div>
                <p class="cell-label">{{ copy.clock }}</p>
                <p class="figure" [class.time-left]="!d.expired">
                  @if (d.expired) {
                    {{ copy.clockExpired }}
                  } @else {
                    {{ timeLeft(d.minutesLeft) }}
                  }
                </p>
                <p class="cell-note muted">{{ copy.clockNote }}</p>
              </div>
              <div>
                <p class="cell-label">{{ copy.probe }}</p>
                <p class="placeholder">
                  @if (d.rowCount === null) {
                    {{ copy.probeUnavailable }}
                  } @else {
                    {{ d.rowCount }}
                  }
                </p>
              </div>
            </div>
          </article>
        }
      }
      @case ('gone') {
        <h2 #heading tabindex="-1" class="notice">{{ copy.gone }}</h2>
      }
      @case ('failed') {
        <h2 #heading tabindex="-1" class="notice" role="alert">
          {{ copy.loadFailed }}
        </h2>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 32px 40px;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--primary);
    }
    h2:focus {
      outline: none;
    }
    h2:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 4px;
    }
    .notice {
      color: var(--foreground);
      font-size: 1.125rem;
    }
    h3 {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--muted-foreground);
      margin-bottom: 12px;
    }
    header p {
      margin-top: 4px;
    }
    .expired {
      border-left: 2px solid var(--failed);
      padding-left: 16px;
      color: var(--failed);
    }
    .ledger {
      display: grid;
      gap: 32px 48px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 32px;
    }
    dl {
      margin: 0;
    }
    dt {
      font-size: 0.875rem;
      color: var(--muted-foreground);
      margin-top: 12px;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .muted {
      display: block;
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    summary {
      cursor: pointer;
      margin-top: 4px;
      color: var(--primary);
      font-size: 0.875rem;
    }
    .codes {
      margin-top: 4px;
      color: var(--muted-foreground);
    }
    .strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 24px;
      margin-top: 32px;
      padding: 16px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }
    .cell-label {
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }
    .cell-note {
      font-size: 0.8125rem;
    }
    .time-left {
      color: var(--pending);
      font-weight: 600;
    }
    .placeholder {
      color: var(--inert);
    }
  `,
})
export class DossierPage {
  private readonly api = inject(QueueApi);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly view = signal<View>({ kind: 'loading' });
  // The narrowed dossier, for the template.
  protected readonly loaded = () => {
    const v = this.view();
    return v.kind === 'ok' ? v.dossier : null;
  };

  private asked = 0;

  protected readonly copy = {
    whoHeading: m.reviewer_dossier_requester_heading(),
    askHeading: m.reviewer_dossier_ask_heading(),
    firstName: m.requester_first_name(),
    lastName: m.requester_last_name(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
    workplace: m.requester_workplace(),
    group: m.reviewer_dossier_group(),
    dates: m.reviewer_dossier_dates(),
    area: m.reviewer_dossier_area(),
    submitted: m.reviewer_submitted_label(),
    clock: m.reviewer_clock_label(),
    clockNote: m.reviewer_clock_note(),
    clockExpired: m.reviewer_clock_expired(),
    probe: m.reviewer_probe_label(),
    probeUnavailable: m.reviewer_probe_unavailable(),
    expired: m.reviewer_dossier_expired(),
    gone: m.reviewer_dossier_gone(),
    loadFailed: m.reviewer_dossier_load_failed(),
  };

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => void this.load(params.get('id') ?? ''));
  }

  private async load(id: string): Promise<void> {
    // The last Request's contact details must not stay on screen under the next
    // Request's heading while it loads.
    this.view.set({ kind: 'loading' });
    const asked = ++this.asked;
    const outcome = await this.api.dossier(id);
    if (asked !== this.asked) return; // the Reviewer has already moved on
    this.view.set(
      outcome.kind === 'ok'
        ? { kind: 'ok', dossier: outcome.dossier }
        : { kind: outcome.kind },
    );
    // Selecting a Request moves focus to its heading, so a keyboard user lands
    // on what they picked rather than back in the list.
    afterNextRender(() => this.heading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected day = formatDay;
  protected instant = formatInstant;
  protected timeLeft = formatDuration;

  protected ahead(count: number | null): string {
    if (count === null) return '';
    if (count === 0) return m.reviewer_dossier_ahead_none();
    if (count === 1) return m.reviewer_dossier_ahead_one();
    return m.reviewer_dossier_ahead({ count });
  }

  protected codesDisclosure(count: number): string {
    return m.reviewer_dossier_codes_disclosure({ count });
  }

  protected areaHeadline(area: Area): string {
    if (area.kind === 'national') return m.requester_area_national();
    return area.region === null
      ? area.provinces.map((p) => p.name).join(', ')
      : m.requester_area_region_selected({ region: area.region });
  }

  // A named region shows the provinces it stands for beneath it; a hand-picked
  // list already is the provinces.
  protected areaProvinces(area: Area): string | null {
    return area.kind === 'provinces' && area.region !== null
      ? area.provinces.map((p) => p.name).join(', ')
      : null;
  }
}
