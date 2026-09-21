import { Component, input, output } from '@angular/core';

export interface SegmentOption {
  value: string;
  label: string;
}

// A small closed set of mutually exclusive choices, where seeing all of them at
// once is the point (docs/design/system.md). One tab stop for the group, arrow
// keys between segments, `role="radiogroup"` over `role="radio"`.
@Component({
  selector: 'app-segmented',
  template: `
    <div class="segmented" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value; let i = $index) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          [tabindex]="option.value === value() ? 0 : -1"
          (click)="choose(option.value)"
          (keydown)="onKey($event, i)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class Segmented {
  readonly options = input.required<SegmentOption[]>();
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly valueChange = output<string>();

  protected choose(value: string) {
    this.valueChange.emit(value);
  }

  protected onKey(event: KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const options = this.options();
    const next = options[(index + step + options.length) % options.length];
    this.choose(next.value);
    const buttons = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll('button');
    buttons?.[options.indexOf(next)]?.focus();
  }
}
