import { Component, computed, input, output } from '@angular/core';
import * as m from '../../paraglide/messages.js';

// Where each health region sits on the schematic (column, row on a 4 × 7
// lattice, docs/design/system.md "Region map"). Schematic, not cartographic: a
// polygon map would put a geography dependency in the bundle for one control.
const LAYOUT: Record<number, [number, number]> = {
  1: [1, 0],
  2: [1, 1],
  8: [2, 1],
  3: [1, 2],
  7: [2, 2],
  4: [1, 3],
  9: [2, 3],
  10: [3, 3],
  5: [0, 4],
  13: [1, 4],
  6: [2, 4],
  11: [0, 5],
  12: [0, 6],
};

// The Requester's area control, and always clickable: pressing a cell asks for
// that health region whatever mode was showing. In province mode the chosen
// province's region is `related`, context rather than an answer.
@Component({
  selector: 'app-region-map',
  template: `
    <div
      class="region-map"
      role="radiogroup"
      data-field="area"
      [attr.aria-label]="m.requester_area_region()"
    >
      @for (cell of cells; track cell.region) {
        <button
          type="button"
          role="radio"
          class="region-cell"
          [class.related]="cell.region === related()"
          [style.grid-column]="cell.column"
          [style.grid-row]="cell.row"
          [attr.aria-checked]="cell.region === selected()"
          [tabindex]="cell.region === focusable() ? 0 : -1"
          [attr.aria-label]="cell.name"
          (click)="pick(cell.region)"
          (keydown)="onKey($event, cell.region)"
        >
          {{ cell.region }}
        </button>
      }
    </div>
  `,
})
export class RegionMap {
  protected readonly m = m;

  readonly selected = input<number | null>(null);
  /** The region of a chosen province, shown for its location only. */
  readonly related = input<number | null>(null);
  readonly picked = output<number>();

  protected readonly cells = Object.entries(LAYOUT)
    .map(([region, [column, row]]) => ({
      region: Number(region),
      column: column + 1,
      row: row + 1,
      // 13 sits out of reading order; its name says why.
      name:
        region === '13'
          ? m.requester_area_region_13_name()
          : m.requester_area_region_selected({ region: Number(region) }),
    }))
    .sort((a, b) => a.region - b.region);

  // The roving tab stop: the chosen region, else the related one, else 1.
  protected readonly focusable = computed(
    () => this.selected() ?? this.related() ?? 1,
  );
  protected pick(region: number) {
    this.picked.emit(region);
  }

  protected onKey(event: KeyboardEvent, region: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = ((region - 1 + step + 13) % 13) + 1;
    this.pick(next);
    const cells = (
      event.currentTarget as HTMLElement
    ).parentElement?.querySelectorAll('button');
    cells?.[next - 1]?.focus();
  }
}
