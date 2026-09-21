import { Component, input } from '@angular/core';

// A label, a value box and at most one line beneath it. An error replaces the
// hint rather than stacking on it: two lines under one box read as neither.
// The box itself is the projected <input class="field-box">, so the label's
// `for` and the message's id are the caller's to pair (inputId, messageId).
@Component({
  selector: 'app-field',
  template: `
    <label class="label" [attr.for]="inputId()">{{ label() }}</label>
    <ng-content />
    @if (error()) {
      <p class="message error" [id]="messageId()">{{ error() }}</p>
    } @else if (hint()) {
      <p class="message hint" [id]="messageId()">{{ hint() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .label {
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }
    .message {
      margin: 0.25rem 0 0;
      font-size: 0.875rem;
    }
    .error {
      color: var(--failed);
    }
    .hint {
      color: var(--muted-foreground);
    }
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly messageId = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string>('');
}
