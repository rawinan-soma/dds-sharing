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
import { ActivatedRoute, Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { formatDay } from '../requester/format-day';
import { areaHeadline, areaProvinces } from './area-copy';
import {
  QueueApi,
  type ProbeRowCount,
  type RecordDecision,
  type RecordFile,
  type RequestRecord,
} from './queue-api';
import { formatInstant } from './queue-format';
import {
  actorWord,
  eventWord,
  linkWord,
  terminalStateWord,
} from './record-copy';
import { zonePath } from './surface-paths';

type View =
  | { kind: 'loading' }
  | { kind: 'ok'; record: RequestRecord }
  | { kind: 'not_found' }
  | { kind: 'failed' };

// A terminal Request, opened by its reference (spec §10.10, handoff screen
// 13): the ask, the Snapshot's workplace and row count beside the Decision and
// its Reviewer, each file and its link, and the event trail newest first.
//
// ⚠️ Read-only: nothing here can be pressed. And never the contact fields
// (ADR 0015): they leave the surface when a Request stops being in flight, and
// a lookup must not become the way round that.
@Component({
  selector: 'app-reviewer-record',
  template: `
    <article class="pane-body">
      @switch (view().kind) {
        @case ('not_found') {
          <h2 #heading tabindex="-1" class="notice">
            {{ copy.notFound }}
          </h2>
        }
        @case ('failed') {
          <h2 #heading tabindex="-1" class="notice" role="alert">
            {{ copy.loadFailed }}
          </h2>
        }
        @case ('ok') {
          @if (record(); as r) {
            <h2 #heading tabindex="-1" class="figure">{{ r.reference }}</h2>
            <p class="header-line">
              <span class="tag">{{ stateWord(r) }}</span>
              <span class="muted">{{ copy.readonly }}</span>
            </p>

            <section class="ended">
              <p class="ended-title">{{ copy.endedTitle }}</p>
              <p>{{ copy.endedDetail }}</p>
            </section>

            <div class="ledger">
              <section>
                <h3>{{ copy.askHeading }}</h3>
                <dl>
                  <dt>{{ copy.group }}</dt>
                  <dd>
                    {{ r.diseaseGroupName }}
                    <span class="muted figure codes">{{
                      r.reportCodes.join(', ')
                    }}</span>
                  </dd>
                  <dt>{{ copy.dates }}</dt>
                  <dd>
                    <time [attr.datetime]="r.startDate">{{
                      day(r.startDate)
                    }}</time>
                    –
                    <time [attr.datetime]="r.endDate">{{
                      day(r.endDate)
                    }}</time>
                  </dd>
                  <dt>{{ copy.area }}</dt>
                  <dd>
                    {{ areaHeadline(r.area) }}
                    @if (areaProvinces(r.area); as names) {
                      <span class="muted">{{ names }}</span>
                    }
                  </dd>
                </dl>
              </section>
              <section>
                <h3>{{ copy.decisionHeading }}</h3>
                @if (r.decision; as d) {
                  <p class="decided">{{ decidedBy(d) }}</p>
                  <dl>
                    <dt>{{ copy.decidedAt }}</dt>
                    <dd>
                      <time [attr.datetime]="d.decidedAt">{{
                        instant(d.decidedAt)
                      }}</time>
                    </dd>
                    <dt>{{ copy.workplace }}</dt>
                    <dd>{{ d.workplace }}</dd>
                    <dt>{{ copy.rowCount }}</dt>
                    <dd class="figure">{{ rowCount(d.rowCount) }}</dd>
                  </dl>
                } @else {
                  <p class="muted">{{ copy.noDecision }}</p>
                }
              </section>
            </div>

            <section class="block">
              <h3>{{ copy.filesHeading }}</h3>
              @if (r.files.length) {
                <table class="files">
                  <thead>
                    <tr>
                      <th scope="col">{{ copy.run }}</th>
                      <th scope="col">{{ copy.fileName }}</th>
                      <th scope="col">{{ copy.link }}</th>
                      <th scope="col">{{ copy.downloads }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (file of r.files; track file.archiveFilename) {
                      <tr>
                        <td class="figure">{{ file.run }}</td>
                        <td class="figure name">{{ file.archiveFilename }}</td>
                        <td>{{ link(file) }}</td>
                        <td class="figure">{{ attempts(file.attempts) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="muted">{{ copy.noFiles }}</p>
              }
            </section>

            <section class="block">
              <h3>{{ copy.eventsHeading }}</h3>
              <p class="muted small">{{ copy.eventsNote }}</p>
              <table class="events">
                <thead>
                  <tr>
                    <th scope="col">{{ copy.when }}</th>
                    <th scope="col">{{ copy.what }}</th>
                    <th scope="col">{{ copy.who }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (event of r.events; track $index) {
                    <tr>
                      <td class="figure">
                        <time [attr.datetime]="event.occurredAt">{{
                          instant(event.occurredAt)
                        }}</time>
                      </td>
                      <td>{{ eventWord(event.type) }}</td>
                      <td>{{ actorWord(event) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </section>
          }
        }
      }
    </article>
  `,
  styles: `
    .pane-body {
      padding: 32px 40px;
      max-width: 880px;
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
    h3 {
      font-size: 1.125rem;
      font-weight: 600;
    }
    .notice {
      color: var(--foreground);
      font-size: 1.125rem;
    }
    .header-line {
      display: flex;
      gap: 12px;
      align-items: baseline;
      margin-top: 4px;
    }
    /* handoff.md screen 13: the state tag in inert, as a word. */
    .tag {
      color: var(--inert);
      font-weight: 600;
    }
    .muted {
      color: var(--muted-foreground);
    }
    .small {
      font-size: 0.875rem;
    }
    .ended {
      margin-top: 24px;
      padding: 20px 24px;
      background: var(--inert-wash);
    }
    .ended p {
      max-width: 720px;
    }
    .ended-title {
      font-weight: 600;
    }
    .ledger {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 48px;
      margin-top: 24px;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 24px;
      margin: 12px 0 8px;
    }
    dt {
      color: var(--muted-foreground);
      font-size: 0.875rem;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .codes {
      display: block;
      font-size: 0.875rem;
    }
    .decided {
      margin-top: 12px;
      font-weight: 600;
    }
    .block {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }
    table {
      width: 100%;
      margin-top: 12px;
      border-collapse: collapse;
    }
    th {
      text-align: left;
      font-size: 0.875rem;
      font-weight: 400;
      color: var(--muted-foreground);
      border-bottom: 1px solid var(--border-strong);
    }
    th,
    td {
      padding: 8px 16px 8px 0;
      vertical-align: top;
    }
    td {
      border-bottom: 1px solid var(--border);
    }
    .name {
      overflow-wrap: anywhere;
    }
  `,
})
export class RecordPage {
  private readonly api = inject(QueueApi);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  protected readonly view = signal<View>({ kind: 'loading' });
  private asked = 0;

  protected readonly copy = {
    notFound: m.reviewer_lookup_not_found(),
    loadFailed: m.reviewer_lookup_load_failed(),
    readonly: m.reviewer_lookup_readonly(),
    endedTitle: m.reviewer_lookup_ended_title(),
    endedDetail: m.reviewer_lookup_ended_detail(),
    askHeading: m.reviewer_dossier_ask_heading(),
    group: m.reviewer_dossier_group(),
    dates: m.reviewer_dossier_dates(),
    area: m.reviewer_dossier_area(),
    decisionHeading: m.reviewer_lookup_decision_heading(),
    decidedAt: m.reviewer_lookup_decided_at(),
    workplace: m.requester_workplace(),
    rowCount: m.reviewer_lookup_probe_at_decision(),
    noDecision: m.reviewer_lookup_no_decision(),
    filesHeading: m.reviewer_lookup_files_heading(),
    run: m.reviewer_lookup_run(),
    fileName: m.reviewer_file_name(),
    link: m.reviewer_lookup_link(),
    downloads: m.reviewer_lookup_downloads(),
    noFiles: m.reviewer_lookup_no_files(),
    eventsHeading: m.reviewer_lookup_events_heading(),
    eventsNote: m.reviewer_lookup_events_note(),
    when: m.reviewer_lookup_event_when(),
    what: m.reviewer_lookup_event_what(),
    who: m.reviewer_lookup_event_who(),
  };

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => void this.load(params.get('reference') ?? ''));
  }

  protected record(): RequestRecord | null {
    const view = this.view();
    return view.kind === 'ok' ? view.record : null;
  }

  private async load(reference: string): Promise<void> {
    const asked = ++this.asked;
    const carried = this.carried(reference);
    if (carried) {
      this.show({ kind: 'ok', record: carried });
      return;
    }
    this.view.set({ kind: 'loading' });
    const outcome = await this.api.lookup(reference);
    if (asked !== this.asked) return;
    switch (outcome.kind) {
      case 'zone':
        // Back on the surface since the link was made: it opens in its zone.
        await this.router.navigate(zonePath(outcome.zone, outcome.requestId), {
          replaceUrl: true,
        });
        return;
      case 'record':
        this.show({ kind: 'ok', record: outcome.record });
        return;
      default:
        this.show(outcome);
    }
  }

  /** The record the search already read, when it is this one. */
  private carried(reference: string): RequestRecord | null {
    const state = (this.router.currentNavigation()?.extras.state ??
      history.state) as { record?: RequestRecord } | null;
    return state?.record?.reference === reference ? state.record : null;
  }

  private show(view: View): void {
    this.view.set(view);
    afterNextRender(() => this.heading()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  protected decidedBy(d: RecordDecision): string {
    return d.outcome === 'approved'
      ? m.reviewer_approved_by({ reviewer: d.reviewer })
      : m.reviewer_rejected_by({ reviewer: d.reviewer });
  }

  protected rowCount(count: ProbeRowCount): string {
    if (count === 'pending') return m.reviewer_lookup_probe_uncounted();
    if (count === 'failed') return m.reviewer_probe_failed();
    return String(count);
  }

  protected stateWord = (r: RequestRecord) => terminalStateWord(r.state);
  protected link = (file: RecordFile) => linkWord(file, Date.now());
  protected attempts = (count: number) =>
    m.reviewer_file_attempts_value({ count });
  protected eventWord = eventWord;
  protected actorWord = actorWord;
  protected day = formatDay;
  protected instant = formatInstant;
  protected areaHeadline = areaHeadline;
  protected areaProvinces = areaProvinces;
}
