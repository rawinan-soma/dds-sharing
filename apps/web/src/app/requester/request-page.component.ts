import {
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { type DateRange, type RangeEnd, pickerBounds } from './calendar';
import { type DateChange, DateField } from './date-field.component';
import { DeidBlock } from './deid-block.component';
import { formatDay } from './format-day';
import { PhoneText } from './phone-text.component';
import { RegionMap } from './region-map.component';
import {
  type FieldKey,
  type FormState,
  type RequirementKey,
  emptyForm,
  meterOf,
  problemsOf,
  regionProvinces,
  requirementsOf,
  submissionBody,
} from './request-form';
import { type ReferenceData, RequesterApi } from './requester-api';
import { Segmented } from './segmented.component';
import { SubmissionState } from './submission-state';
import { dayCount } from './span-cap';

type Step = 'form' | 'check' | 'duplicate';

const asString = (event: Event) => (event.target as HTMLInputElement).value;

const RULE_LABELS: Record<RequirementKey, () => string> = {
  group: m.requester_rule_group,
  dates: m.requester_rule_dates,
  area: m.requester_rule_area,
  identity: m.requester_rule_identity,
  contact: m.requester_rule_contact,
};

// The Requester page: the file contents, then the map-first split (the area on
// the map, the rest in the form card), then a check page, then either the
// confirmation (its own route) or the duplicate notice. The steps are state
// and not addresses, so going back to edit keeps every field and nothing about
// the ask ever appears in a URL (spec §16.2, §16.4).
@Component({
  selector: 'app-request-page',
  imports: [DateField, DeidBlock, PhoneText, RegionMap, Segmented],
  templateUrl: './request-page.component.html',
})
export class RequestPage implements OnInit {
  protected readonly m = m;
  protected readonly formatDay = formatDay;
  protected readonly ruleLabels = RULE_LABELS;

  private readonly api = inject(RequesterApi);
  private readonly router = inject(Router);
  private readonly submissions = inject(SubmissionState);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly step = signal<Step>('form');
  protected readonly form = signal<FormState>(emptyForm());
  protected readonly reference = signal<ReferenceData>({
    diseaseGroups: [],
    provinces: [],
  });
  /** A date box holding text that is not a day; the form stores '' for it. */
  protected readonly unreadable = signal<Record<RangeEnd, boolean>>({
    from: false,
    to: false,
  });
  /** Errors stay quiet until a first attempt to go on. */
  protected readonly attempted = signal(false);
  protected readonly sending = signal(false);
  protected readonly sendFailed = signal(false);
  protected readonly tipOpen = signal(false);

  protected readonly problems = computed(() => problemsOf(this.form()));
  protected readonly missing = computed(() => new Set(this.problems().missing));
  protected readonly anyUnreadable = computed(
    () => this.unreadable().from || this.unreadable().to,
  );
  protected readonly requirements = computed(() =>
    requirementsOf(this.problems(), this.anyUnreadable()),
  );
  protected readonly metCount = computed(
    () => this.requirements().filter((r) => r.state === 'met').length,
  );
  protected readonly meter = computed(() => meterOf(this.metCount()));
  protected readonly segments = computed(() =>
    [1, 2, 3].map((n) => n <= this.meter().lit),
  );
  protected readonly dateBroken = computed(() =>
    this.requirements().some((r) => r.key === 'dates' && r.state === 'broken'),
  );
  protected readonly issueCount = computed(
    () => this.problems().missing.length + (this.dateBroken() ? 1 : 0),
  );
  /** Said only once the checklist is met, so a refused send names one thing. */
  protected readonly consentMissing = computed(
    () => this.attempted() && this.issueCount() === 0 && !this.form().consent,
  );

  /** Both date ends, for the pickers' bounds and the wash between them. */
  protected readonly range = computed<DateRange>(() => ({
    from: this.form().from,
    to: this.form().to,
  }));
  protected readonly fromBounds = computed(() =>
    pickerBounds('from', this.range()),
  );
  protected readonly toBounds = computed(() =>
    pickerBounds('to', this.range()),
  );
  protected readonly days = computed(() =>
    dayCount(this.form().from, this.form().to),
  );
  /** The shared message under the date pair, if any. */
  protected readonly dateMessage = computed(() => {
    if (this.anyUnreadable()) return 'unreadable';
    if (this.problems().reversed) return 'reversed';
    if (this.problems().spanTooLong) return 'span';
    return null;
  });

  protected readonly regionList = computed(() =>
    regionProvinces(this.form().region, this.reference().provinces),
  );
  protected readonly chosenProvince = computed(() =>
    this.reference().provinces.find(
      (p) => p.provinceId === this.form().provinceId,
    ),
  );
  protected readonly chosenGroup = computed(() =>
    this.reference().diseaseGroups.find(
      (g) => g.id === this.form().diseaseGroupId,
    ),
  );
  protected readonly mapRegion = computed(() =>
    this.form().areaMode === 'region' ? this.form().region : null,
  );
  protected readonly relatedRegion = computed(() =>
    this.form().areaMode === 'province'
      ? (this.chosenProvince()?.healthRegion ?? null)
      : null,
  );
  protected readonly areaLabel = computed(() => {
    const { areaMode, region } = this.form();
    if (areaMode === 'province') {
      return this.chosenProvince()?.nameTh ?? m.requester_area_province();
    }
    if (areaMode === 'region' && region !== null) {
      return m.requester_area_region_selected({ region });
    }
    return m.requester_area_national();
  });

  // The two ways into Area beside the map; the map itself is the third.
  protected readonly areaOptions = [
    { value: 'national', label: m.requester_area_national() },
    { value: 'province', label: m.requester_area_province() },
  ];

  async ngOnInit() {
    try {
      this.reference.set(await this.api.reference());
    } catch {
      // The form is unusable without its pickers; the check on submit says so.
    }
  }

  protected set(patch: Partial<FormState>) {
    this.form.update((current) => ({ ...current, ...patch }));
  }

  protected text(
    field: 'name' | 'surname' | 'tel' | 'email' | 'workplace',
    event: Event,
  ) {
    this.set({ [field]: asString(event) });
  }

  protected asValue(event: Event) {
    return asString(event);
  }

  protected date(end: RangeEnd, change: DateChange) {
    this.set({ [end]: change.value });
    this.unreadable.update((u) => ({ ...u, [end]: change.unreadable }));
  }

  protected chooseArea(mode: string) {
    this.set({ areaMode: mode === 'province' ? 'province' : 'national' });
  }

  protected pickRegion(region: number) {
    this.set({ areaMode: 'region', region });
  }

  protected fieldError(key: FieldKey): string | null {
    if (!this.attempted() || !this.missing().has(key)) return null;
    return key === 'email'
      ? m.error_email_required()
      : m.error_field_required();
  }

  protected dateInvalid(end: RangeEnd) {
    return (
      this.dateBroken() || this.unreadable()[end] || !!this.fieldError(end)
    );
  }

  protected review(event: Event) {
    event.preventDefault();
    this.attempted.set(true);
    this.sendFailed.set(false);
    if (this.issueCount() > 0) {
      this.focusSoon('[data-checklist]');
      return;
    }
    if (!this.form().consent) {
      this.focusSoon('#consent');
      return;
    }
    this.go('check');
  }

  /** The area jumps to the province select in province mode, else the map. */
  protected jumpTo(key: FieldKey) {
    const target =
      key !== 'area'
        ? `[data-field="${key}"]`
        : this.form().areaMode === 'province'
          ? '#province'
          : 'app-region-map [tabindex="0"]';
    this.host.nativeElement.querySelector<HTMLElement>(target)?.focus();
  }

  protected clearForm() {
    this.form.set(emptyForm());
    this.unreadable.set({ from: false, to: false });
    this.attempted.set(false);
    this.sendFailed.set(false);
  }

  protected edit() {
    this.go('form');
  }

  protected async send() {
    if (this.sending()) return;
    this.sending.set(true);
    this.sendFailed.set(false);
    const outcome = await this.api.submit(submissionBody(this.form()));
    this.sending.set(false);

    switch (outcome.status) {
      case 'submitted': {
        const { from, to } = this.form();
        this.submissions.current.set({
          reference: outcome.reference,
          diseaseGroupName: this.chosenGroup()?.name ?? '',
          from,
          to,
          areaLabel: this.areaLabel(),
        });
        // The confirmation holds nothing in its address.
        await this.router.navigateByUrl('/submitted');
        return;
      }
      case 'in_progress':
        this.go('duplicate');
        return;
      case 'refused':
        // The picker mirrors the cap, so this is a direct-API-shaped failure.
        // A span the server refuses goes back to the form, where its panel is;
        // anything else is a failed send, said where sending happens (1b).
        if (outcome.problems.some((p) => p.code === 'span_too_long')) {
          this.attempted.set(true);
          this.go('form');
        } else {
          this.sendFailed.set(true);
        }
        return;
      case 'failed':
        this.sendFailed.set(true);
        return;
    }
  }

  private go(step: Step) {
    this.step.set(step);
    this.host.nativeElement.ownerDocument.documentElement.scrollTop = 0;
    this.focusSoon('h1');
  }

  private focusSoon(selector: string) {
    setTimeout(
      () =>
        this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
      0,
    );
  }
}
