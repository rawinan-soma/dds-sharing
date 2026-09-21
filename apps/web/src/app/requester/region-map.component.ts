import { Component, computed, input, output } from '@angular/core';
import * as m from '../../paraglide/messages.js';

// Where each health region sits on the schematic (column, row on a 5 × 7
// lattice). Schematic, not cartographic: a polygon map would put a geography
// dependency in the bundle for one control (docs/design/handoff.md).
const LAYOUT: Record<number, [number, number]> = {
  1: [1, 0],
  2: [1, 1],
  8: [3, 1],
  3: [1, 2],
  7: [3, 2],
  4: [1, 3],
  9: [3, 3],
  10: [4, 3],
  5: [0, 4],
  13: [1, 4],
  6: [2, 4],
  11: [0, 5],
  12: [0, 6],
};

// One component, two roles. In region mode the cells are the radiogroup and the
// map is the control; in province mode they are `aria-hidden` decoration
// showing where the chosen province is.
@Component({
  selector: 'app-region-map',
  template: `
    @if (interactive()) {
      <div
        class="region-map"
        role="radiogroup"
        tabindex="-1"
        data-field="area"
        [attr.aria-label]="m.requester_area_region()"
      >
        @for (cell of cells; track cell.region) {
          <button
            type="button"
            role="radio"
            class="region-cell"
            [style.grid-column]="cell.column"
            [style.grid-row]="cell.row"
            [attr.aria-checked]="cell.region === selected()"
            [tabindex]="cell.region === focusable() ? 0 : -1"
            [attr.aria-label]="
              m.requester_area_region_selected({ region: cell.region })
            "
            (click)="pick(cell.region)"
            (keydown)="onKey($event, cell.region)"
          >
            {{ cell.region }}
          </button>
        }
      </div>
    } @else {
      <div class="region-map" aria-hidden="true">
        @for (cell of cells; track cell.region) {
          <div
            class="region-cell"
            [class.related]="cell.region === highlighted()"
            [style.grid-column]="cell.column"
            [style.grid-row]="cell.row"
          >
            {{ cell.region }}
          </div>
        }
      </div>
    }
    <p class="small muted">{{ m.requester_area_region_13_caption() }}</p>
  `,
})
export class RegionMap {
  protected readonly m = m;

  readonly interactive = input(false);
  readonly selected = input<number | null>(null);
  /** The region to tint when the map is decoration (the chosen province's). */
  readonly highlighted = input<number | null>(null);
  readonly picked = output<number>();

  protected readonly cells = Object.entries(LAYOUT)
    .map(([region, [column, row]]) => ({
      region: Number(region),
      column: column + 1,
      row: row + 1,
    }))
    .sort((a, b) => a.region - b.region);

  // The roving tab stop: the chosen region, or the first when none is.
  protected readonly focusable = computed(() => this.selected() ?? 1);

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
