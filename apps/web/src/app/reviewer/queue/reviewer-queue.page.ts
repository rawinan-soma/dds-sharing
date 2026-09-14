import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ReviewerQueueApiService } from './reviewer-queue-api.service.js';
import type { DecisionOutcome, QueueRow, RequestDetail } from './reviewer-queue-api.types.js';

type QueueLoadState = 'loading' | 'loaded' | 'error';
type DetailLoadState = 'idle' | 'loading' | 'loaded' | 'not_found' | 'error';

// Below the identity fields and the ask, never above them (spec §10.2) — the
// template only ever renders these buttons under the ledger and judgement
// line. 'decided' is terminal for a selection: nothing here ever advances it
// to another row on its own (spec §10.3's auto-advance warning).
type DecisionPhase = 'idle' | 'confirm_approve' | 'reject_note' | 'submitting' | 'decided';

const REFRESHED_AGO_TICK_MS = 30_000;
const MIN_INTERNAL_NOTE_LENGTH = 10;

/**
 * The split queue and dossier (spec §10.1, §10.2, §10.3 — design handoff
 * screen 7b). Nothing here polls — every fetch is a direct result of a
 * Reviewer loading this screen, pressing Refresh, picking a row, or making
 * a Decision (spec §10.5), which is what lets each one extend the session.
 */
@Component({
  selector: 'app-reviewer-queue',
  imports: [ReactiveFormsModule],
  templateUrl: './reviewer-queue.page.html',
  styleUrl: './reviewer-queue.page.scss',
})
export class ReviewerQueuePage implements OnInit, OnDestroy {
  private readonly api = inject(ReviewerQueueApiService);
  private agoTimer?: ReturnType<typeof setInterval>;

  @Input({ required: true }) displayName!: string;
  /** Fires on a deliberate sign-out click — the parent owns the actual API call and session-ceiling teardown. */
  @Output() readonly signOutRequested = new EventEmitter<void>();
  /**
   * Fires when a fetch here comes back 401 — the only signal available for
   * the *idle* timeout, which (unlike the absolute ceiling) has no
   * client-side timer of its own (session-ceiling.service.ts).
   */
  @Output() readonly sessionExpired = new EventEmitter<void>();

  protected readonly queueState = signal<QueueLoadState>('loading');
  protected readonly rows = signal<QueueRow[]>([]);
  protected readonly refreshedAt = signal<string | null>(null);
  protected readonly agoTick = signal(Date.now());

  protected readonly selectedId = signal<string | null>(null);
  protected readonly detailState = signal<DetailLoadState>('idle');
  protected readonly detail = signal<RequestDetail | null>(null);

  // The Decision (spec §10.3) — a rejection's internal note is never
  // persisted client-side (spec §10.5, design handoff §7b): this control
  // lives only in this component's memory and is explicitly reset, never
  // read back from any store.
  protected readonly decisionPhase = signal<DecisionPhase>('idle');
  protected readonly decisionMessage = signal<string | null>(null);
  protected readonly decisionError = signal<string | null>(null);
  protected readonly rejectNoteControl = new FormControl('', { nonNullable: true });

  /**
   * The design handoff (screen 7b) has the empty-queue copy branch on
   * whether Alerts are open — "the desk is not clear" rather than "nothing
   * to do" — but the Alerts zone itself is #73's. Pinned to `false` here so
   * the branch exists for #73 to feed without this ticket building Alerts.
   */
  protected readonly hasOpenAlerts = signal(false);

  ngOnInit(): void {
    void this.load();
    this.agoTimer = setInterval(() => this.agoTick.set(Date.now()), REFRESHED_AGO_TICK_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.agoTimer);
  }

  async load(): Promise<void> {
    this.queueState.set('loading');
    const outcome = await this.api.listPending();
    if (outcome.outcome === 'unauthenticated') {
      this.sessionExpired.emit();
      return;
    }
    if (outcome.outcome === 'unexpected') {
      this.queueState.set('error');
      return;
    }
    this.rows.set(outcome.result.requests);
    this.refreshedAt.set(outcome.result.refreshedAt);
    this.agoTick.set(Date.now());
    this.queueState.set('loaded');

    // A row that dropped out of the list (only reachable today by another
    // Reviewer's session, since this ticket writes no decision) can no
    // longer be shown as selected.
    const stillPending = outcome.result.requests.some((row) => row.id === this.selectedId());
    if (this.selectedId() && !stillPending) {
      this.selectedId.set(null);
      this.detailState.set('idle');
      this.detail.set(null);
      this.resetDecisionState();
    } else if (this.selectedId()) {
      void this.loadDetail(this.selectedId()!);
    }
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  async select(id: string): Promise<void> {
    this.selectedId.set(id);
    this.resetDecisionState();
    await this.loadDetail(id);
  }

  private resetDecisionState(): void {
    this.decisionPhase.set('idle');
    this.decisionMessage.set(null);
    this.decisionError.set(null);
    this.rejectNoteControl.setValue('');
  }

  private async loadDetail(id: string): Promise<void> {
    this.detailState.set('loading');
    const outcome = await this.api.getDetail(id);
    if (outcome.outcome === 'unauthenticated') {
      this.sessionExpired.emit();
      return;
    }
    if (outcome.outcome === 'not_found') {
      this.detailState.set('not_found');
      this.detail.set(null);
      return;
    }
    if (outcome.outcome === 'unexpected') {
      this.detailState.set('error');
      this.detail.set(null);
      return;
    }
    this.detail.set(outcome.result);
    this.detailState.set('loaded');
  }

  // The Decision (spec §10.3) --------------------------------------------

  protected askApprove(): void {
    this.decisionPhase.set('confirm_approve');
    this.decisionError.set(null);
  }

  protected askReject(): void {
    this.decisionPhase.set('reject_note');
    this.rejectNoteControl.setValue('');
    this.decisionError.set(null);
  }

  protected cancelDecision(): void {
    this.decisionPhase.set('idle');
    this.rejectNoteControl.setValue('');
    this.decisionError.set(null);
  }

  async submitApprove(): Promise<void> {
    const id = this.selectedId();
    if (!id || this.decisionPhase() === 'submitting') return;
    this.decisionPhase.set('submitting');
    const outcome = await this.api.approve(id);
    this.handleDecisionOutcome(id, outcome);
  }

  async submitReject(): Promise<void> {
    const id = this.selectedId();
    if (!id) return;
    const note = this.rejectNoteControl.value.trim();
    if (note.length < MIN_INTERNAL_NOTE_LENGTH) {
      this.decisionError.set(`At least ${MIN_INTERNAL_NOTE_LENGTH} characters.`);
      return;
    }
    this.decisionPhase.set('submitting');
    const outcome = await this.api.reject(id, note);
    this.handleDecisionOutcome(id, outcome);
  }

  /**
   * The instant a Decision lands, the buttons are replaced by a plain
   * statement of what was recorded and the Request drops out of the pending
   * list in this same response (spec §10.3) — never a toast, and never a
   * jump to the next pending Request.
   */
  private handleDecisionOutcome(id: string, outcome: DecisionOutcome): void {
    if (outcome.outcome === 'unauthenticated') {
      this.sessionExpired.emit();
      return;
    }

    if (outcome.outcome === 'approved') {
      this.dropFromQueue(id);
      this.decisionPhase.set('decided');
      this.decisionMessage.set(
        `Approved by you at ${this.formatDateTime(outcome.decidedAt)}. The Requester will be emailed when the Extract is ready — this Request now lives on the in-flight list.`,
      );
      return;
    }

    if (outcome.outcome === 'rejected') {
      this.dropFromQueue(id);
      this.decisionPhase.set('decided');
      this.decisionMessage.set(`Rejected at ${this.formatDateTime(outcome.decidedAt)}. The Requester was told no reason.`);
      return;
    }

    if (outcome.outcome === 'expired') {
      // The 24-hour expiry is enforced at the moment of decision, not only
      // by a sweeper (spec §10.4) — this Reviewer just spent real attention
      // on a Request that aged out while they were reading it.
      this.dropFromQueue(id);
      this.decisionPhase.set('decided');
      this.decisionError.set('This request expired while you were reviewing it — nothing was recorded.');
      return;
    }

    if (outcome.outcome === 'note_too_short') {
      this.decisionPhase.set('reject_note');
      this.decisionError.set(`At least ${MIN_INTERNAL_NOTE_LENGTH} characters.`);
      return;
    }

    // not_pending / unexpected: something else decided this Request first,
    // or the request itself failed — either way, refresh rather than guess.
    this.decisionPhase.set('idle');
    this.decisionError.set('This request is no longer pending. Refreshing the queue…');
    void this.load();
  }

  private dropFromQueue(id: string): void {
    this.rows.set(this.rows().filter((row) => row.id !== id));
    this.refreshedAt.set(new Date().toISOString());
    this.agoTick.set(Date.now());
  }

  protected formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }

  /** `fromDate`/`toDate` are date-only (`YYYY-MM-DD`) — rendered in UTC so the calendar day never shifts with the viewer's zone. */
  protected formatIsoDate(iso: string): string {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  }

  protected refreshedAgoLabel(): string {
    const refreshedAt = this.refreshedAt();
    if (!refreshedAt) return '';
    const minutes = Math.max(0, Math.round((this.agoTick() - new Date(refreshedAt).getTime()) / 60_000));
    if (minutes < 1) return 'Refreshed just now';
    if (minutes === 1) return 'Refreshed 1 min ago';
    return `Refreshed ${minutes} min ago`;
  }
}
