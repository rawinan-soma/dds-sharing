import { Component, input } from '@angular/core';

// A label, a value box and at most one line beneath it. An error replaces the
// hint rather than stacking on it: two lines under one box read as neither.
// The box itself is the projected <input class="field-box">, so the label's
// `for` and the message's id are the caller's to pair (inputId, messageId).
@Component({
  selector: 'app-field',
  host: { class: 'field', '[class.is-required]': 'required()' },
  template: `
    <label class="field-label" [attr.for]="inputId()">{{ label() }}</label>
    <ng-content />
    @if (error()) {
      <p class="field-message error" [id]="messageId()">{{ error() }}</p>
    } @else if (hint()) {
      <p class="field-message" [id]="messageId()">{{ hint() }}</p>
    }
  `,
  // The mark is drawn, not written, so the label's text stays the field's
  // name; the control's own `required` is what a screen reader announces.
  styles: `
    :host(.is-required) .field-label::after {
      content: '\\00a0*' / '';
      color: var(--primary);
    }
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
  readonly messageId = input<string>('');
  readonly hint = input<string>('');
  readonly error = input<string>('');
  /** The `*` in `primary`; the control itself carries `required`. */
  readonly required = input(false);
}
