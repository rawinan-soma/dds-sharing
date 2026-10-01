import { Component, input } from '@angular/core';

export type IconName = 'refresh' | 'chevron' | 'lock' | 'check';

// The app's line icons on the Reviewer surface: the same 24-unit grid, round
// caps and 1.8 stroke as the Requester's calendar and file icons, drawn inline
// so nothing is fetched. Decorative only: the words beside each one carry the
// meaning, so every icon is aria-hidden.
@Component({
  selector: 'app-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="name() === 'check' ? 2.6 : 1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('refresh') {
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v4.5h-4.5" />
        }
        @case ('chevron') {
          <path d="m9 6 6 6-6 6" />
        }
        @case ('lock') {
          <rect x="5" y="11" width="14" height="9.5" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        }
        @case ('check') {
          <path d="M5 12.5 10 17l9-10" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(18);
}
