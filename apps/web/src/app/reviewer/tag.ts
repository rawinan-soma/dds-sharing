import { Component, input } from '@angular/core';

/** What a Tag says about a Request (system.md "Component: Tag"). */
export type TagTone = 'success' | 'pending' | 'failed' | 'inert';

// The state of a Request, and nothing else: a word on its own wash, never
// colour alone. `sm` in list rows, `md` beside a heading.
@Component({
  selector: 'app-tag',
  host: {
    class: 'tag',
    '[class.success]': "tone() === 'success'",
    '[class.pending]': "tone() === 'pending'",
    '[class.failed]': "tone() === 'failed'",
    '[class.inert]': "tone() === 'inert'",
    '[class.md]': "size() === 'md'",
  },
  template: `<ng-content />`,
})
export class Tag {
  readonly tone = input.required<TagTone>();
  readonly size = input<'sm' | 'md'>('sm');
}
