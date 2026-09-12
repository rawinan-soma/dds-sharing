import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as m from '../../../paraglide/messages.js';
import { DISEASE_GROUPS } from '../../reference-data/disease-groups.js';
import { PROVINCES } from '../../reference-data/provinces.js';
import { RequestsApiService } from '../../requests-api/requests-api.service.js';
import type { SubmitRequestBody } from '../../requests-api/requests-api.types.js';
import { addDays } from './date-math.js';
import {
  emptyRequestFormState,
  type RequestFormState,
} from './request-form.model.js';
import { inclusiveDayCount } from './span-days.js';
import {
  validateRequestForm,
  type RequestFormFieldErrors,
} from './validate-request-form.js';

const HEALTH_REGIONS = Array.from({ length: 13 }, (_, i) => i + 1);
const MAX_SPAN_DAYS = 365;

@Component({
  selector: 'app-request-form-page',
  imports: [FormsModule],
  templateUrl: './request-form.page.html',
  styleUrl: './request-form.page.scss',
})
export class RequestFormPage {
  private readonly router = inject(Router);
  private readonly requestsApi = inject(RequestsApiService);

  protected readonly m = m;
  protected readonly diseaseGroups = DISEASE_GROUPS;
  protected readonly provinces = PROVINCES;
  protected readonly healthRegions = HEALTH_REGIONS;

  protected readonly form = signal<RequestFormState>(emptyRequestFormState());
  protected readonly mode = signal<'editing' | 'reviewing'>('editing');
  protected readonly errors = signal<RequestFormFieldErrors | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly dayCount = computed(() => {
    const { from, to } = this.form();
    if (!from || !to) return null;
    const days = inclusiveDayCount(from, to);
    return Number.isFinite(days) ? days : null;
  });

  protected readonly maxToDate = computed(() => {
    const { from } = this.form();
    return from ? addDays(from, MAX_SPAN_DAYS - 1) : null;
  });

  protected readonly regionProvinces = computed(() => {
    const region = this.form().region;
    if (region == null) return [];
    return this.provinces.filter((p) => p.healthRegion === region);
  });

  protected readonly selectedDiseaseGroupName = computed(
    () =>
      this.diseaseGroups.find((g) => g.id === this.form().diseaseGroupId)
        ?.nameTh ?? '',
  );

  protected readonly selectedProvinceName = computed(
    () =>
      this.provinces.find((p) => p.provinceId === this.form().provinceId)
        ?.nameTh ?? '',
  );

  protected updateForm(patch: Partial<RequestFormState>): void {
    this.form.update((current) => ({ ...current, ...patch }));
  }

  protected updateContact(patch: Partial<RequestFormState['contact']>): void {
    this.form.update((current) => ({
      ...current,
      contact: { ...current.contact, ...patch },
    }));
  }

  protected onCheckRequest(): void {
    const result = validateRequestForm(this.form(), this.provinces);
    if (!result.ok) {
      this.errors.set(result.errors);
      return;
    }
    this.errors.set(null);
    this.mode.set('reviewing');
  }

  protected onGoBack(): void {
    this.mode.set('editing');
  }

  protected async onConfirmSubmit(): Promise<void> {
    this.submitting.set(true);
    this.submitError.set(null);

    const outcome = await this.requestsApi.submit(this.buildSubmitBody());
    this.submitting.set(false);

    if (outcome.kind === 'submitted') {
      await this.router.navigate(['/submitted'], {
        state: { kind: 'acknowledged', ...outcome.value },
      });
      return;
    }
    if (outcome.kind === 'duplicate') {
      await this.router.navigate(['/submitted'], {
        state: { kind: 'duplicate', ...outcome.value },
      });
      return;
    }
    if (outcome.kind === 'validation_error') {
      // The server re-checked and found something the client-side check
      // did not (e.g. a stale page) — go back to editing so the Requester
      // can see the fields again.
      this.mode.set('editing');
      this.submitError.set(m.requester_submit_generic_error());
      return;
    }
    this.submitError.set(m.requester_submit_generic_error());
  }

  private buildSubmitBody(): SubmitRequestBody {
    const state = this.form();
    const area: SubmitRequestBody['area'] =
      state.areaKind === 'province' && state.provinceId
        ? { kind: 'province', provinceId: state.provinceId }
        : state.areaKind === 'region' && state.region != null
          ? { kind: 'region', region: state.region }
          : { kind: 'national' };

    return {
      diseaseGroupId: state.diseaseGroupId ?? '',
      from: state.from,
      to: state.to,
      area,
      contact: state.contact,
    };
  }
}
