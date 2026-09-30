import { Component, computed, input, output } from '@angular/core';

export interface SegmentOption {
  value: string;
  label: string;
}

// The Area modes beside the map (docs/design/system.md "Segmented"): separate
// buttons, the selected one a mode rather than the answer. One tab stop for the
// group, arrow keys between segments, `role="radiogroup"` over `role="radio"`.
// None is selected while the map holds the answer (a health region).
@Component({
  selector: 'app-segmented',
  template: `
    <div class="segmented" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value; let i = $index) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="option.value === value()"
          [tabindex]="option.value === tabStop() ? 0 : -1"
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

  protected readonly tabStop = computed(() => {
    const options = this.options();
    return options.some((o) => o.value === this.value())
      ? this.value()
      : options[0]?.value;
  });

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
