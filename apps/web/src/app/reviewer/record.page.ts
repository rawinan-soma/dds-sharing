import { Component, DestroyRef, Injector, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import {
  DateRange,
  DossierMessage,
  focusHeadingAfterRender,
} from './dossier-parts';
import { areaLine } from './area-copy';
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
import { Tag } from './tag';

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
  imports: [DateRange, DossierMessage, Tag],
  template: `
    @switch (view().kind) {
      @case ('not_found') {
        <app-dossier-message [text]="copy.notFound" />
      }
      @case ('failed') {
        <app-dossier-message [text]="copy.loadFailed" [announce]="true" />
      }
      @case ('ok') {
        @if (record(); as r) {
          <article class="dossier">
            <!-- The headline is the reference, never a name. -->
            <header class="dossier-head">
              <div>
                <div class="head-tags">
                  <app-tag size="md" tone="inert">{{ copy.endedTag }}</app-tag>
                </div>
                <h2 tabindex="-1" class="figure">
                  {{ headline(r.reference) }}
                </h2>
              </div>
            </header>

            <section class="statement inert">
              <p class="statement-title">{{ copy.endedTitle }}</p>
              <p>{{ copy.endedDetail }}</p>
            </section>

            <div class="dossier-columns">
              <section aria-labelledby="ask">
                <h3 id="ask" class="section-title">{{ copy.askHeading }}</h3>
                <dl class="rows compact">
                  <div>
                    <dt>{{ copy.group }}</dt>
                    <dd>
                      {{ r.diseaseGroupName }}
                      <span class="note figure">{{
                        r.reportCodes.join(', ')
                      }}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ copy.dates }}</dt>
                    <dd>
                      <app-date-range [start]="r.startDate" [end]="r.endDate" />
                    </dd>
                  </div>
                  <div>
                    <dt>{{ copy.area }}</dt>
                    <dd>{{ areaLine(r.area) }}</dd>
                  </div>
                  @if (r.decision; as d) {
                    <div>
                      <dt>{{ copy.workplace }}</dt>
                      <dd>{{ d.workplace }}</dd>
                    </div>
                  }
                </dl>
              </section>
              <section aria-labelledby="decision">
                <h3 id="decision" class="section-title">
                  {{ copy.decisionHeading }}
                </h3>
                <dl class="rows compact">
                  <div>
                    <dt>{{ copy.state }}</dt>
                    <dd>{{ stateWord(r) }}</dd>
                  </div>
                  @if (r.decision; as d) {
                    <div>
                      <dt>{{ copy.outcome }}</dt>
                      <dd>{{ decidedBy(d) }}</dd>
                    </div>
                    <div>
                      <dt>{{ copy.decidedAt }}</dt>
                      <dd>
                        <time [attr.datetime]="d.decidedAt">{{
                          instant(d.decidedAt)
                        }}</time>
                      </dd>
                    </div>
                    <div>
                      <dt>{{ copy.rowCount }}</dt>
                      <dd class="figure">{{ rowCount(d.rowCount) }}</dd>
                    </div>
                  } @else {
                    <div>
                      <dt>{{ copy.outcome }}</dt>
                      <dd>{{ copy.noDecision }}</dd>
                    </div>
                  }
                </dl>
              </section>
            </div>

            <section aria-labelledby="files">
              <h3 id="files" class="section-title">{{ copy.filesHeading }}</h3>
              @if (r.files.length) {
                <div class="table-card">
                  <table class="zone-table files">
                    <colgroup>
                      <col class="w-run" />
                      <col />
                      <col class="w-link" />
                      <col class="w-downloads" />
                    </colgroup>
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
                          <td class="figure">{{ file.archiveFilename }}</td>
                          <td>{{ link(file) }}</td>
                          <td class="figure">{{ attempts(file.attempts) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="muted">{{ copy.noFiles }}</p>
              }
            </section>

            <section aria-labelledby="events">
              <h3 id="events" class="section-title tight">
                {{ copy.eventsHeading }}
              </h3>
              <div class="table-card">
                <table class="zone-table events">
                  <colgroup>
                    <col class="w-when" />
                    <col />
                    <col class="w-who" />
                  </colgroup>
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
              </div>
            </section>
          </article>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .table-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .events {
      font-size: 13px;
    }
    .w-run {
      width: 96px;
    }
    .w-link {
      width: 240px;
    }
    .w-downloads {
      width: 140px;
    }
    .w-when {
      width: 240px;
    }
    .w-who {
      width: 200px;
    }
  `,
})
export class RecordPage {
  private readonly api = inject(QueueApi);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  protected readonly view = signal<View>({ kind: 'loading' });
  private asked = 0;

  protected readonly copy = {
    notFound: m.reviewer_lookup_not_found(),
    loadFailed: m.reviewer_lookup_load_failed(),
    endedTag: m.reviewer_lookup_ended_tag(),
    state: m.reviewer_col_state(),
    outcome: m.reviewer_lookup_outcome(),
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
    focusHeadingAfterRender(this.injector);
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
  protected instant = formatInstant;
  protected areaLine = areaLine;
  protected headline = (reference: string) =>
    m.reviewer_lookup_headline({ reference });
}
