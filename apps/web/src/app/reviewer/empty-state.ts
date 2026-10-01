import { Component, input } from '@angular/core';
import { Icon } from './icon';

// In place of a table, never beside it (system.md "Component: Empty state"):
// a 48px mark on a state wash, an 18/600 headline, then whatever lines and the
// one action the caller projects. `success` is a tick (done), `pending` a `!`
// (a person is still waited on), `inert` a tick on grey (nothing to do).
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  template: `
    <div class="empty-state">
      <span
        class="status-mark"
        [class.success]="tone() === 'success'"
        [class.pending]="tone() === 'pending'"
        [class.inert]="tone() === 'inert'"
        aria-hidden="true"
      >
        @if (tone() === 'pending') {
          !
        } @else {
          <app-icon name="check" [size]="22" />
        }
      </span>
      <h2>{{ title() }}</h2>
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly tone = input.required<'success' | 'pending' | 'inert'>();
  readonly title = input.required<string>();
}
