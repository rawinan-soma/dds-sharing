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
import { DeidBlock } from './deid-block.component';
import { formatDay } from './format-day';
import { RegionMap } from './region-map.component';
import {
  type AreaMode,
  type FieldKey,
  type FormState,
  emptyForm,
  problemsOf,
  regionProvinces,
  submissionBody,
} from './request-form';
import { type ReferenceData, RequesterApi } from './requester-api';
import { Segmented } from './segmented.component';
import { SubmissionState } from './submission-state';
import { dayCount, latestTo } from './span-cap';

type Step = 'form' | 'check' | 'duplicate';

const asString = (event: Event) => (event.target as HTMLInputElement).value;

// The Requester page: one scrolling form, then a check page, then either the
// confirmation (its own route) or the duplicate notice. The steps are state and
// not addresses, so going back to edit keeps every field and nothing about the
// ask ever appears in a URL (spec §16.2, §16.4).
@Component({
  selector: 'app-request-page',
  imports: [DeidBlock, RegionMap, Segmented],
  templateUrl: './request-page.component.html',
})
export class RequestPage implements OnInit {
  protected readonly m = m;
  protected readonly formatDay = formatDay;

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
  /** Errors stay quiet until a first attempt to go on. */
  protected readonly attempted = signal(false);
  protected readonly sending = signal(false);
  protected readonly sendFailed = signal(false);

  protected readonly problems = computed(() => problemsOf(this.form()));
  protected readonly missing = computed(() => new Set(this.problems().missing));
  protected readonly issueCount = computed(
    () =>
      this.problems().missing.length + (this.problems().spanTooLong ? 1 : 0),
  );

  protected readonly toMax = computed(() => {
    const { from } = this.form();
    return from ? latestTo(from) : null;
  });
  protected readonly days = computed(() =>
    dayCount(this.form().from, this.form().to),
  );

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
  protected readonly areaLabel = computed(() => {
    const { areaMode, region } = this.form();
    if (areaMode === 'province') return this.chosenProvince()?.nameTh ?? '';
    if (areaMode === 'region' && region !== null) {
      return m.requester_area_region_selected({ region });
    }
    return m.requester_area_national();
  });

  protected readonly areaOptions = [
    { value: 'national', label: m.requester_area_national() },
    { value: 'province', label: m.requester_area_province() },
    { value: 'region', label: m.requester_area_region() },
  ];

  protected readonly fieldLabels: Record<FieldKey, () => string> = {
    diseaseGroupId: m.requester_group_heading,
    from: m.requester_dates_from,
    to: m.requester_dates_to,
    area: m.requester_area_heading,
    name: m.requester_first_name,
    surname: m.requester_last_name,
    tel: m.requester_telephone,
    email: m.requester_email,
    workplace: m.requester_workplace,
  };

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
    field: 'name' | 'surname' | 'tel' | 'email' | 'workplace' | 'from' | 'to',
    event: Event,
  ) {
    this.set({ [field]: asString(event) });
  }

  protected asValue(event: Event) {
    return asString(event);
  }

  protected chooseArea(mode: string) {
    this.set({ areaMode: mode as AreaMode });
  }

  protected fieldError(key: FieldKey): string | null {
    if (!this.attempted() || !this.missing().has(key)) return null;
    return key === 'email'
      ? m.error_email_required()
      : m.error_field_required();
  }

  protected review(event: Event) {
    event.preventDefault();
    this.attempted.set(true);
    this.sendFailed.set(false);
    if (this.issueCount() > 0) {
      this.focusSoon('[data-summary]');
      return;
    }
    this.go('check');
  }

  protected jumpTo(key: FieldKey) {
    const target = this.host.nativeElement.querySelector<HTMLElement>(
      `[data-field="${key}"]`,
    );
    target?.focus();
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
        // The picker mirrors the cap, so this is a direct-API-shaped failure:
        // send the Requester back to the form with the reasons in view.
        this.attempted.set(true);
        this.sendFailed.set(
          !outcome.problems.some((p) => p.code === 'span_too_long'),
        );
        this.go('form');
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
