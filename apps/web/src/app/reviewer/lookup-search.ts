import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { Field } from './field';
import { QueueApi, type SurfaceZone } from './queue-api';

/** Where a Request still on the surface opens: its own zone, as usual. */
export function zonePath(zone: SurfaceZone, requestId: string): string[] {
  switch (zone) {
    case 'queue':
      return ['/reviewer', requestId];
    case 'alerts':
      return ['/reviewer', 'alerts', requestId];
    case 'in_flight':
      return ['/reviewer', 'in-flight', requestId];
  }
}

/** Where a terminal Request opens: as a record, by its reference. */
export const recordPath = (reference: string) => [
  '/reviewer',
  'lookup',
  reference,
];

type Problem = 'not_found' | 'failed' | null;

// The search field in the sidebar header, above refresh (spec §10.10,
// handoff screen 13). Exact reference only: there is deliberately no search by
// name, email, workplace or telephone, because a search by person is the
// prior-Request history §10.2 declined, by another route.
@Component({
  selector: 'app-lookup-search',
  imports: [Field],
  template: `
    <form role="search" (submit)="$event.preventDefault(); find()">
      <!-- Polite, like the refresh result: "not found" must be heard too. -->
      <app-field
        aria-live="polite"
        [label]="copy.label"
        inputId="lookup-reference"
        messageId="lookup-message"
        [hint]="copy.hint"
        [error]="problemText()"
      >
        <input
          id="lookup-reference"
          class="field-box figure"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          aria-describedby="lookup-message"
          [attr.aria-invalid]="problem() === 'not_found' ? 'true' : null"
          [value]="reference()"
          (input)="typed($event)"
        />
      </app-field>
      <button
        class="btn btn-secondary btn-full find"
        type="submit"
        [attr.aria-busy]="loading() || null"
      >
        {{ loading() ? copy.loading : copy.submit }}
      </button>
    </form>
  `,
  styles: `
    form {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
    }
  `,
})
export class LookupSearch {
  private readonly api = inject(QueueApi);
  private readonly router = inject(Router);

  protected readonly reference = signal('');
  protected readonly loading = signal(false);
  protected readonly problem = signal<Problem>(null);

  protected readonly copy = {
    label: m.reviewer_lookup_label(),
    hint: m.reviewer_lookup_hint(),
    submit: m.reviewer_lookup_submit(),
    loading: m.reviewer_lookup_loading(),
  };

  protected problemText(): string {
    switch (this.problem()) {
      case 'not_found':
        return m.reviewer_lookup_not_found();
      case 'failed':
        return m.reviewer_lookup_failed();
      case null:
        return '';
    }
  }

  protected typed(event: Event): void {
    this.reference.set((event.target as HTMLInputElement).value);
    this.problem.set(null);
  }

  protected async find(): Promise<void> {
    const reference = this.reference().trim();
    if (!reference || this.loading()) return;
    this.loading.set(true);
    this.problem.set(null);
    const outcome = await this.api.lookup(reference);
    this.loading.set(false);
    switch (outcome.kind) {
      case 'zone':
        await this.router.navigate(zonePath(outcome.zone, outcome.requestId));
        return;
      case 'record':
        // Carried, so the record opens without being read a second time.
        await this.router.navigate(recordPath(outcome.record.reference), {
          state: { record: outcome.record },
        });
        return;
      case 'not_found':
      case 'failed':
        this.problem.set(outcome.kind);
    }
  }
}
