import { Component, computed, input } from '@angular/core';
import * as m from '../../paraglide/messages.js';

// A sentence carrying the service's telephone number, with the number set bold
// and tabular as every frame draws it. The copy stays one catalogue string.
@Component({
  selector: 'app-phone-text',
  // Text through bindings, not interpolation, so the template's own line
  // breaks never become spaces around the number.
  template: `
    @for (part of parts(); track $index) {
      @if ($odd) {
        <strong class="figure" [textContent]="part"></strong>
      } @else {
        <span [textContent]="part"></span>
      }
    }
  `,
})
export class PhoneText {
  readonly text = input.required<string>();

  protected readonly parts = computed(() => {
    const telephone = m.app_telephone();
    return this.text()
      .split(telephone)
      .flatMap((part, i) => (i === 0 ? [part] : [telephone, part]));
  });
}
