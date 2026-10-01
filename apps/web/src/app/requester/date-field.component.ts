import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import * as m from '../../paraglide/messages.js';
import {
  MONTHS_LONG,
  buddhistYear,
  formatBeDate,
  parseBeDate,
} from './be-date';
import { type Bounds, type DateRange, calendarMonth } from './calendar';
import { formatDay } from './format-day';
import { shiftDay } from './span-cap';

const WEEKDAY = new Intl.DateTimeFormat('th-TH', {
  weekday: 'narrow',
  timeZone: 'UTC',
});
// 1–7 February 2026 run Sunday to Saturday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  WEEKDAY.format(new Date(Date.UTC(2026, 1, 1 + i))),
);
const BANGKOK_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
});
const YEARS_BACK = 20;

/** An update from the box: the stored day, or '' with `unreadable` set. */
export interface DateChange {
  value: string;
  unreadable: boolean;
}

// One date box, typed and shown in พ.ศ., with the calendar popover
// (docs/design/system.md "Date field"). It stores ISO. Typing is the first way
// in; the picker is the second, and it offers only the days in `bounds`, so it
// can never produce a range over the cap.
@Component({
  selector: 'app-date-field',
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div class="date-box">
      <input
        class="field-box figure"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        [id]="inputId()"
        [attr.data-field]="fieldKey()"
        [placeholder]="m.requester_date_placeholder()"
        [value]="text()"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        (input)="onType($event)"
        (blur)="showAtRest()"
      />
      <button
        #trigger
        type="button"
        class="calendar-button"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="m.requester_calendar_open({ field: label() })"
        (click)="toggle()"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
      </button>
    </div>
    @if (open()) {
      <div
        class="calendar"
        role="dialog"
        [class.start]="align() === 'start'"
        [class.end]="align() === 'end'"
        [attr.aria-label]="label()"
        (keydown.escape)="close(true)"
      >
        <div class="calendar-head">
          <button
            type="button"
            class="calendar-step"
            [attr.aria-label]="m.requester_calendar_previous()"
            (click)="step(-1)"
          >
            ‹
          </button>
          <select
            class="field-box"
            [attr.aria-label]="m.requester_calendar_month()"
            (change)="showMonth(shown().year, +$any($event.target).value)"
          >
            @for (name of months; track $index) {
              <option
                [value]="$index + 1"
                [selected]="$index + 1 === shown().month"
              >
                {{ name }}
              </option>
            }
          </select>
          <select
            class="field-box figure"
            [attr.aria-label]="m.requester_calendar_year()"
            (change)="showMonth(+$any($event.target).value, shown().month)"
          >
            @for (year of years(); track year) {
              <option [value]="year" [selected]="year === shown().year">
                {{ buddhistYear(year) }}
              </option>
            }
          </select>
          <button
            type="button"
            class="calendar-step"
            [attr.aria-label]="m.requester_calendar_next()"
            (click)="step(1)"
          >
            ›
          </button>
        </div>
        <div class="calendar-grid">
          @for (name of weekdays; track $index) {
            <span class="weekday" aria-hidden="true">{{ name }}</span>
          }
          @for (blank of leadCells(); track $index) {
            <span></span>
          }
          @for (day of grid().days; track day.iso) {
            <button
              type="button"
              class="calendar-day"
              [class.in-range]="day.inRange"
              [class.today]="day.today"
              [attr.data-day]="day.iso"
              [attr.aria-pressed]="day.chosen"
              [attr.aria-label]="formatDay(day.iso)"
              [attr.aria-current]="day.today ? 'date' : null"
              [disabled]="day.disabled"
              [tabindex]="day.iso === focusDay() ? 0 : -1"
              (click)="pick(day.iso)"
              (keydown)="onGridKey($event)"
            >
              {{ day.day }}
            </button>
          }
        </div>
        @if (capNote() || todayPickable()) {
          <div class="calendar-foot">
            <span>{{ capNote() }}</span>
            @if (todayPickable()) {
              <button type="button" (click)="pick(today)">
                {{ m.requester_calendar_today() }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
})
export class DateField {
  protected readonly m = m;
  protected readonly months = MONTHS_LONG;
  protected readonly weekdays = WEEKDAYS;
  protected readonly buddhistYear = buddhistYear;

  readonly inputId = input.required<string>();
  readonly fieldKey = input.required<string>();
  readonly label = input.required<string>();
  /** The stored day, ISO, or '' when empty or unreadable. */
  readonly value = input.required<string>();
  /** The box holds text that is not a day; kept so the Requester can fix it. */
  readonly unreadable = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly bounds = input<Bounds>({ min: null, max: null });
  /** The whole range, for the wash between its ends. */
  readonly range = input<DateRange>({ from: '', to: '' });
  /** Which side of the box the popover hangs from, so it stays in the card. */
  readonly align = input<'start' | 'end'>('start');
  readonly capNote = input('');
  readonly changed = output<DateChange>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly text = signal('');
  protected readonly open = signal(false);
  protected readonly shown = signal({ year: 2000, month: 1 });
  protected readonly focusDay = signal('');
  protected readonly today = BANGKOK_DAY.format(new Date());

  constructor() {
    // The box shows what the Requester typed while it reads as the stored day;
    // a day set from outside (a pick, a reset, a return from the check page) is
    // shown at rest instead.
    effect(() => {
      const value = this.value();
      const unreadable = this.unreadable();
      untracked(() => {
        if (value) {
          if (parseBeDate(this.text()) !== value) {
            this.text.set(formatBeDate(value));
          }
        } else if (!unreadable) {
          this.text.set('');
        }
      });
    });
  }

  protected readonly grid = computed(() => {
    const { year, month } = this.shown();
    const { from, to } = this.range();
    return calendarMonth(year, month, {
      ...this.bounds(),
      from,
      to,
      chosen: this.value(),
      today: this.today,
    });
  });
  protected readonly leadCells = computed(() =>
    Array.from({ length: this.grid().lead }),
  );
  protected readonly years = computed(() => {
    const now = Number(this.today.slice(0, 4));
    const shown = this.shown().year;
    const first = Math.min(now - YEARS_BACK, shown);
    const last = Math.max(now, shown);
    return Array.from({ length: last - first + 1 }, (_, i) => last - i);
  });
  protected readonly todayPickable = computed(() => {
    const { min, max } = this.bounds();
    return (!min || this.today >= min) && (!max || this.today <= max);
  });

  protected readonly formatDay = formatDay;

  protected onType(event: Event) {
    const typed = (event.target as HTMLInputElement).value;
    this.text.set(typed);
    const day = parseBeDate(typed);
    this.changed.emit({
      value: day ?? '',
      unreadable: day === null && typed.trim() !== '',
    });
  }

  /** At rest the box reads in its own form, so a typed 2026 shows as 2569. */
  protected showAtRest() {
    const day = parseBeDate(this.text());
    if (day) this.text.set(formatBeDate(day));
  }

  protected toggle() {
    if (this.open()) {
      this.close(true);
      return;
    }
    const { min, max } = this.bounds();
    let start = this.value() || this.today;
    if (min && start < min) start = min;
    if (max && start > max) start = max;
    this.shown.set(monthOfDay(start));
    this.focusDay.set(start);
    this.open.set(true);
    this.focusSoon(start);
  }

  protected close(returnFocus: boolean) {
    this.open.set(false);
    if (returnFocus) {
      this.host.nativeElement
        .querySelector<HTMLButtonElement>('.calendar-button')
        ?.focus();
    }
  }

  protected pick(iso: string) {
    this.text.set(formatBeDate(iso));
    this.changed.emit({ value: iso, unreadable: false });
    this.close(true);
  }

  protected step(months: number) {
    const { year, month } = this.shown();
    const index = year * 12 + (month - 1) + months;
    this.showMonth(Math.floor(index / 12), (index % 12) + 1);
  }

  protected showMonth(year: number, month: number) {
    this.shown.set({ year, month });
    const first = this.grid().days.find((d) => !d.disabled);
    if (first) this.focusDay.set(first.iso);
  }

  /** Arrows move by day and week, across months, never onto a disabled day. */
  protected onGridKey(event: KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    const by = moves[event.key];
    if (by === undefined) return;
    event.preventDefault();
    // Days outside the bounds are the only disabled ones, so skipping them
    // means stopping at the edge.
    const { min, max } = this.bounds();
    const next = shiftDay(this.focusDay(), by);
    if ((min && next < min) || (max && next > max)) return;
    this.shown.set(monthOfDay(next));
    this.focusDay.set(next);
    this.focusSoon(next);
  }

  protected onDocumentClick(event: MouseEvent) {
    if (
      this.open() &&
      !this.host.nativeElement.contains(event.target as Node)
    ) {
      this.close(false);
    }
  }

  private focusSoon(iso: string) {
    setTimeout(() =>
      this.host.nativeElement
        .querySelector<HTMLButtonElement>(`[data-day="${iso}"]`)
        ?.focus(),
    );
  }
}

function monthOfDay(iso: string) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}
