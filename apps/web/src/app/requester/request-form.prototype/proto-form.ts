// PROTOTYPE — wipe me. The state every variant reads, so flipping variants
// keeps what was typed. It reuses the real form rules (request-form.ts) and
// never posts: "send" only raises a toast with the body that would go.
import { Injectable, computed, inject, signal } from '@angular/core';
import { STUB_REFERENCE } from '../../prototype/stub-reference.prototype';
import {
  type FieldKey,
  type FormState,
  emptyForm,
  problemsOf,
  regionProvinces,
  submissionBody,
} from '../request-form';
import { type ReferenceData, RequesterApi } from '../requester-api';
import { dayCount, latestTo } from '../span-cap';

export type ToastKind = 'success' | 'warning' | 'info' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail: string;
}

export const FIELD_LABELS: Record<FieldKey, string> = {
  diseaseGroupId: 'กลุ่มโรค',
  from: 'วันที่เริ่มต้น',
  to: 'วันที่สิ้นสุด',
  area: 'พื้นที่',
  name: 'ชื่อ',
  surname: 'นามสกุล',
  tel: 'โทรศัพท์',
  email: 'อีเมล',
  workplace: 'หน่วยงาน',
};

@Injectable()
export class ProtoForm {
  private readonly api = inject(RequesterApi);
  private nextToast = 1;

  readonly form = signal<FormState>(emptyForm());
  readonly reference = signal<ReferenceData>(STUB_REFERENCE);
  readonly attempted = signal(false);
  readonly toasts = signal<Toast[]>([]);

  readonly problems = computed(() => problemsOf(this.form()));
  readonly missing = computed(() => new Set(this.problems().missing));
  readonly days = computed(() => dayCount(this.form().from, this.form().to));
  readonly toMax = computed(() =>
    this.form().from ? latestTo(this.form().from) : null,
  );
  readonly regionList = computed(() =>
    regionProvinces(this.form().region, this.reference().provinces),
  );
  readonly chosenProvince = computed(() =>
    this.reference().provinces.find(
      (p) => p.provinceId === this.form().provinceId,
    ),
  );
  readonly chosenGroup = computed(() =>
    this.reference().diseaseGroups.find(
      (g) => g.id === this.form().diseaseGroupId,
    ),
  );
  readonly areaLabel = computed(() => {
    const { areaMode, region } = this.form();
    if (areaMode === 'province') return this.chosenProvince()?.nameTh ?? '—';
    if (areaMode === 'region') {
      return region === null ? '—' : `เขตสุขภาพที่ ${region}`;
    }
    return 'ทั้งประเทศ';
  });
  /** The region to light on the map, whatever the mode. */
  readonly mapRegion = computed(() => {
    const { areaMode, region } = this.form();
    if (areaMode === 'region') return region;
    if (areaMode === 'province')
      return this.chosenProvince()?.healthRegion ?? null;
    return null;
  });

  readonly askDone = computed(
    () =>
      (['diseaseGroupId', 'from', 'to', 'area'] as FieldKey[]).every(
        (k) => !this.missing().has(k),
      ) &&
      !this.problems().spanTooLong &&
      !this.problems().reversed,
  );
  readonly contactDone = computed(() =>
    (['name', 'surname', 'tel', 'email', 'workplace'] as FieldKey[]).every(
      (k) => !this.missing().has(k),
    ),
  );

  constructor() {
    // Real reference data when the API is up; the stub otherwise.
    this.api.reference().then(
      (data) => data.diseaseGroups.length && this.reference.set(data),
      () => undefined,
    );
  }

  set(patch: Partial<FormState>) {
    this.form.update((current) => ({ ...current, ...patch }));
  }

  text(field: keyof FormState, event: Event) {
    this.set({ [field]: (event.target as HTMLInputElement).value });
  }

  pickRegion(region: number) {
    this.set({ areaMode: 'region', region });
  }

  error(key: FieldKey): boolean {
    return this.attempted() && this.missing().has(key);
  }

  reset() {
    this.form.set(emptyForm());
    this.attempted.set(false);
    this.toast('info', 'ล้างฟอร์มแล้ว', 'เริ่มกรอกใหม่ได้เลย');
  }

  /** Stub send: validates, then toasts the body instead of posting it. */
  send(): boolean {
    this.attempted.set(true);
    const { missing, spanTooLong, reversed } = this.problems();
    if (missing.length || spanTooLong || reversed) {
      if (spanTooLong) {
        this.toast('error', 'ช่วงวันที่เกิน 365 วัน', 'กรุณาแยกส่งหลายคำขอ');
      }
      if (reversed) {
        this.toast(
          'error',
          'วันที่สิ้นสุดอยู่ก่อนวันเริ่มต้น',
          'กรุณาแก้ช่วงวันที่',
        );
      }
      if (missing.length) {
        this.toast(
          'warning',
          `ยังขาดอีก ${missing.length} รายการ`,
          missing.map((k) => FIELD_LABELS[k]).join(' · '),
        );
      }
      return false;
    }
    const body = submissionBody(this.form());
    this.toast(
      'success',
      'ส่งคำขอแล้ว (จำลอง)',
      `เลขที่คำขอ DDS-PROTO-0001 · ${JSON.stringify(body.area ?? 'national')}`,
    );
    return true;
  }

  toast(kind: ToastKind, title: string, detail: string) {
    const id = this.nextToast++;
    this.toasts.update((all) => [...all, { id, kind, title, detail }]);
    setTimeout(() => this.dismiss(id), 7000);
  }

  dismiss(id: number) {
    this.toasts.update((all) => all.filter((t) => t.id !== id));
  }
}
