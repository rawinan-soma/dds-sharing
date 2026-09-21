import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '../../paraglide/messages.js';
import { routes } from '../app.routes';
import { RequestPage } from './request-page.component';
import { type ReferenceData } from './requester-api';
import { SubmissionState } from './submission-state';

const GROUP_NAMES = [
  'โรคจากการสัมผัสมลพิษทางอากาศ',
  'โรคซิลิโคสิส',
  'โรคจากแร่ใยหิน',
  'โรคจากตะกั่วและสารประกอบของตะกั่ว',
  'โรคจากสารกำจัดศัตรูพืช',
  'การบาดเจ็บจากภาวะอับอากาศ',
  'โรคจากรังสี',
  'โรคจากการทำงาน',
  'โรคที่เกี่ยวข้องกับการสัมผัสมลพิษในสิ่งแวดล้อม',
  'โรคจากความร้อน',
];

const REFERENCE: ReferenceData = {
  diseaseGroups: GROUP_NAMES.map((name, i) => ({ id: `group-${i + 1}`, name })),
  provinces: [
    { provinceId: '10', nameTh: 'กรุงเทพมหานคร', healthRegion: 13 },
    { provinceId: '50', nameTh: 'เชียงใหม่', healthRegion: 1 },
    { provinceId: '57', nameTh: 'เชียงราย', healthRegion: 1 },
  ],
};

describe('RequestPage', () => {
  let fixture: ComponentFixture<RequestPage>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const settle = () => fixture.whenStable();
  // A response lands through a promise: let it, then let the view catch up.
  const tick = async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
  };
  const $ = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector);
  const $$ = <T extends HTMLElement>(selector: string) =>
    Array.from(root.querySelectorAll<T>(selector));

  async function type(selector: string, value: string) {
    const input = $<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function click(element: HTMLElement | null) {
    element!.click();
    await settle();
  }

  async function submitForm() {
    $<HTMLFormElement>('form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await settle();
  }

  async function chooseGroup(index: number) {
    const radio = $$<HTMLInputElement>('input[name="disease-group"]')[index];
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  async function fillEverything() {
    await chooseGroup(1);
    await type('#date-from', '2025-01-01');
    await type('#date-to', '2025-01-31');
    await type('#c-name', 'Somchai');
    await type('#c-surname', 'Jaidee');
    await type('#c-tel', '081 234 5678');
    await type('#c-email', 'somchai@example.go.th');
    await type('#c-workplace', 'Regional Office 1');
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(routes),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RequestPage);
    root = fixture.nativeElement as HTMLElement;
    await settle();
    http.expectOne('/api/reference').flush(REFERENCE);
    // The pickers arrive through a promise; let it land before rendering.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settle();
  });

  describe('the page', () => {
    it('runs in order: gate notice, de-identification block, parameters, contact fields, submit', () => {
      const anchors = [
        $('[data-notice="gate"]'),
        $('app-deid-block'),
        $('#params-heading'),
        $('#contact-heading'),
        $('button[type="submit"]'),
      ];

      anchors.forEach((anchor) => expect(anchor).not.toBeNull());
      for (let i = 0; i < anchors.length - 1; i++) {
        const follows = anchors[i]!.compareDocumentPosition(anchors[i + 1]!);
        expect(follows & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    it('states the approval gate before anything else on the page but the title', () => {
      const main = $('form')!;
      const first = main.querySelector('p');

      expect(first?.textContent).toContain(m.requester_gate_notice());
    });

    it('shows the de-identification block open, with no control to open it', () => {
      const block = $('app-deid-block')!;

      expect(
        block.querySelector('details, [hidden], button, [aria-expanded]'),
      ).toBeNull();
      expect(block.textContent).toContain(m.requester_deid_included_1());
      expect(block.textContent).toContain(m.requester_deid_excluded_1());
      expect(block.textContent).toContain(m.requester_deid_lead());
    });

    it('carries the six load-bearing copy keys on the form', () => {
      const text = root.textContent ?? '';

      for (const copy of [
        m.requester_gate_notice(),
        m.requester_no_reason_notice(),
        m.requester_span_cap_notice(),
        m.requester_epidem_area_label(),
        m.requester_email_warning(),
        m.requester_retention_notice(),
      ]) {
        expect(text).toContain(copy);
      }
    });

    it('offers the Disease groups by name and never shows a Report code', () => {
      const rows = $$('.group-row');

      expect(rows.map((r) => r.textContent?.trim())).toEqual(GROUP_NAMES);
      expect($$('input[name="disease-group"]')).toHaveLength(10);
      expect(root.textContent).not.toMatch(/\b(2\d\d|501)\b/);
    });

    it('never shows a row count', () => {
      expect(root.textContent).not.toMatch(/\brows?\b/i);
    });

    it('takes the five contact fields as plain text, with no picklist for workplace', () => {
      const ids = [
        '#c-name',
        '#c-surname',
        '#c-tel',
        '#c-email',
        '#c-workplace',
      ];

      for (const id of ids) {
        const input = $<HTMLInputElement>(id)!;
        expect(input.type).toBe('text');
        expect(input.hasAttribute('list')).toBe(false);
        expect(input.hasAttribute('pattern')).toBe(false);
      }
      expect(
        $('#c-workplace')!.closest('.field')!.querySelector('select, datalist'),
      ).toBeNull();
    });
  });

  describe('the date range', () => {
    it('greys out any `to` beyond from + 365 days', async () => {
      await type('#date-from', '2025-01-01');

      expect($('#date-to')!.getAttribute('max')).toBe('2026-01-01');
      expect($('#date-to')!.getAttribute('min')).toBe('2025-01-01');
    });

    it('refuses an over-span range inline and never offers to split it', async () => {
      await type('#date-from', '2025-01-01');
      await type('#date-to', '2026-01-02');

      expect($('#span-error')!.textContent).toContain(
        m.error_span_too_long_title(),
      );
      expect($('#date-from')!.getAttribute('aria-invalid')).toBe('true');
      expect($('#date-to')!.getAttribute('aria-invalid')).toBe('true');
      expect(root.textContent).not.toMatch(/split (it )?for you:/i);
    });

    it('accepts exactly 365 days without complaint', async () => {
      await type('#date-from', '2025-01-01');
      await type('#date-to', '2026-01-01');

      expect($('#span-error')).toBeNull();
    });
  });

  describe('area selection', () => {
    const modes = () => $$('app-segmented button[role="radio"]');

    it('offers national, one province or one health region', () => {
      expect(modes().map((b) => b.textContent?.trim())).toEqual([
        m.requester_area_national(),
        m.requester_area_province(),
        m.requester_area_region(),
      ]);
      expect(modes()[0].getAttribute('aria-checked')).toBe('true');
    });

    it('shows the provinces a region expands to before submit', async () => {
      await click(modes()[2]);
      await click($$<HTMLButtonElement>('button.region-cell')[0]);

      expect(
        $$('[data-region-provinces] li').map((li) => li.textContent),
      ).toEqual(['เชียงใหม่', 'เชียงราย']);
    });

    it('offers the province select only in province mode, so never both', async () => {
      await click(modes()[1]);
      expect($('#province')).not.toBeNull();
      expect($$('button.region-cell')).toHaveLength(0);

      await click(modes()[2]);
      expect($('#province')).toBeNull();
      expect($$('button.region-cell')).toHaveLength(13);
    });

    it('treats the map as decoration in province mode', async () => {
      await click(modes()[1]);

      expect($('app-region-map .region-map')!.getAttribute('aria-hidden')).toBe(
        'true',
      );
    });
  });

  describe('submit', () => {
    it('refuses an incomplete form, names what is missing, and keeps what was typed', async () => {
      await type('#c-name', 'Somchai');
      await submitForm();

      const summary = $('[data-summary]')!;
      expect(summary.textContent).toContain(m.error_incomplete_hint());
      expect(summary.querySelectorAll('li').length).toBe(7);
      expect($('#c-name')!.getAttribute('aria-invalid')).toBeNull();
      expect($<HTMLInputElement>('#c-name')!.value).toBe('Somchai');
      expect($('#c-email')!.getAttribute('aria-invalid')).toBe('true');
    });

    it('goes to the check page, not the server, and posts nothing', async () => {
      await fillEverything();
      await submitForm();

      expect($('[data-check-email]')!.textContent).toBe(
        'somchai@example.go.th',
      );
      http.expectNone('/api/requests');
    });

    it('keeps every field when the Requester goes back to edit', async () => {
      await fillEverything();
      await submitForm();
      await click(
        $$<HTMLButtonElement>('button').find((b) =>
          b.textContent?.includes(m.requester_check_edit()),
        )!,
      );

      expect($<HTMLInputElement>('#c-email')!.value).toBe(
        'somchai@example.go.th',
      );
      expect($<HTMLInputElement>('#date-to')!.value).toBe('2025-01-31');
      expect(
        $<HTMLInputElement>('input[name="disease-group"]:checked'),
      ).not.toBeNull();
    });

    async function send() {
      await fillEverything();
      await submitForm();
      await click(
        $$<HTMLButtonElement>('button').find((b) =>
          b.textContent?.includes(m.requester_check_send()),
        )!,
      );
    }

    it('posts the ask, and only the chosen area, and lands on a confirmation with nothing in its address', async () => {
      await fillEverything();
      await click($$('app-segmented button')[2]);
      await click($$<HTMLButtonElement>('button.region-cell')[0]);
      await submitForm();
      await click(
        $$<HTMLButtonElement>('button').find((b) =>
          b.textContent?.includes(m.requester_check_send()),
        )!,
      );

      const req = http.expectOne('/api/requests');
      expect(req.request.body).toEqual({
        diseaseGroupId: 'group-2',
        from: '2025-01-01',
        to: '2025-01-31',
        area: { region: 1 },
        contact: {
          name: 'Somchai',
          surname: 'Jaidee',
          tel: '081 234 5678',
          email: 'somchai@example.go.th',
          workplace: 'Regional Office 1',
        },
      });
      req.flush({ reference: 'REQ-2569-0142' });
      await settle();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const router = TestBed.inject(Router);
      expect(router.url).toBe('/submitted');
      expect(router.url).not.toContain('REQ');
      expect(TestBed.inject(SubmissionState).current()?.reference).toBe(
        'REQ-2569-0142',
      );
    });

    it('shows the duplicate notice, with no reference number, when the server says one is in progress', async () => {
      await send();
      http
        .expectOne('/api/requests')
        .flush(
          { code: 'request_in_progress' },
          { status: 409, statusText: 'Conflict' },
        );
      await tick();

      expect($('h1')!.textContent).toBe(m.requester_duplicate_title());
      expect(root.textContent).not.toMatch(/REQ-/);
      expect(root.textContent).not.toMatch(/rate|limit/i);
    });

    it('says the request may not have been sent when the server cannot be reached, and stays on the check page', async () => {
      await send();
      http
        .expectOne('/api/requests')
        .flush(null, { status: 503, statusText: 'Unavailable' });
      await tick();

      expect(root.textContent).toContain(
        m.requester_submit_failed({ telephone: m.app_telephone() }),
      );
      expect($('[data-check-email]')).not.toBeNull();
    });

    it('does not let the Requester go back to edit while the request is on its way', async () => {
      await send();

      const edit = $$<HTMLButtonElement>('button').find((b) =>
        b.textContent?.includes(m.requester_check_edit()),
      )!;
      expect(edit.disabled).toBe(true);
      const sending = $$<HTMLButtonElement>('button').find(
        (b) => b.getAttribute('aria-busy') === 'true',
      )!;
      expect(sending.textContent).toContain(m.requester_submit_loading());

      http.expectOne('/api/requests').flush({ reference: 'REQ-2569-0001' });
    });
  });
});
