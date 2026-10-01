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
    const select = $<HTMLSelectElement>('#group')!;
    select.value = `group-${index + 1}`;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  async function consent() {
    const box = $<HTMLInputElement>('#consent')!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  async function fillEverything() {
    await chooseGroup(1);
    await type('#date-from', '1/1/2568');
    await type('#date-to', '31/1/2568');
    await type('#c-name', 'Somchai');
    await type('#c-surname', 'Jaidee');
    await type('#c-tel', '081 234 5678');
    await type('#c-email', 'somchai@example.go.th');
    await type('#c-workplace', 'Regional Office 1');
    await consent();
  }

  const checkRows = () => $$('[data-checklist] li');

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
    it('runs in order: title, file contents, the map pane, then the form card to submit', () => {
      const anchors = [
        $('h1'),
        $('app-deid-block'),
        $('.map-pane'),
        $('.form-card'),
        $('[data-checklist]'),
        $('#consent'),
        $('button[type="submit"]'),
      ];

      anchors.forEach((anchor) => expect(anchor).not.toBeNull());
      for (let i = 0; i < anchors.length - 1; i++) {
        const follows = anchors[i]!.compareDocumentPosition(anchors[i + 1]!);
        expect(follows & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    it('shows what the file contains open, with no control to open it', () => {
      const block = $('app-deid-block')!;

      expect(
        block.querySelector('details, [hidden], button, [aria-expanded]'),
      ).toBeNull();
      expect(block.textContent).toContain(m.requester_deid_included_1());
      expect(block.textContent).toContain(m.requester_deid_excluded_1());
    });

    it('states which province the Area filters on, in the map pane', () => {
      const note = $('.map-pane [data-epidem-area]')!;

      expect(note.textContent).toContain(m.requester_epidem_area_label());
      expect(note.textContent).toContain(m.requester_epidem_area_detail());
    });

    it('carries the email warning with the email field, and retention in the consent block', () => {
      const email = $('#c-email')!;
      const tip = $(`#${email.getAttribute('aria-describedby')}`)!;

      expect(tip.textContent).toContain(m.requester_email_warning());
      expect($('#consent')!.closest('.consent')!.textContent).toContain(
        m.requester_retention_notice(),
      );
    });

    it('opens the email warning on focus of its trigger and closes it on Escape', async () => {
      const trigger = $<HTMLButtonElement>('.tip-trigger')!;
      const tip = $('#email-tip')!;
      expect(tip.hidden).toBe(true);

      trigger.dispatchEvent(new Event('focus'));
      await settle();
      expect(tip.hidden).toBe(false);

      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(tip.hidden).toBe(true);
    });

    it('offers the Disease groups by name and never shows a Report code', () => {
      const options = $$<HTMLOptionElement>('#group option').filter(
        (o) => o.value,
      );

      expect(options.map((o) => o.textContent?.trim())).toEqual(GROUP_NAMES);
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
    it('has no native date input: dates are typed in the Buddhist era', () => {
      expect($$('input[type="date"]')).toHaveLength(0);
      expect($<HTMLInputElement>('#date-from')!.type).toBe('text');
    });

    it('stores what is typed in พ.ศ. as ISO and shows it back at rest', async () => {
      await type('#date-from', '1/3/2026');
      $('#date-from')!.dispatchEvent(new Event('blur'));
      await settle();

      expect($<HTMLInputElement>('#date-from')!.value).toBe('1 มี.ค. 2569');
    });

    it('says a date that does not read cannot be read, and fails the date rule', async () => {
      await type('#date-from', '31/2/2568');

      expect(root.textContent).toContain(m.error_date_unreadable());
      expect($('#date-from')!.getAttribute('aria-invalid')).toBe('true');
      expect(checkRows()[1].classList).toContain('broken');
    });

    it('refuses an over-span range inline and never offers to split it', async () => {
      await type('#date-from', '1/1/2568');
      await type('#date-to', '2/1/2569');

      expect($('#span-error')!.textContent).toContain(
        m.error_span_too_long_title(),
      );
      expect($('#date-from')!.getAttribute('aria-invalid')).toBe('true');
      expect($('#date-to')!.getAttribute('aria-invalid')).toBe('true');
      expect(root.textContent).not.toMatch(/split (it )?for you:/i);
    });

    it('accepts exactly 365 days without complaint', async () => {
      await type('#date-from', '1/1/2568');
      await type('#date-to', '1/1/2569');

      expect($('#span-error')).toBeNull();
    });

    it('opens a พ.ศ. calendar under "to" that offers nothing before `from` or past the cap', async () => {
      await type('#date-from', '1/1/2568');
      const buttons = $$<HTMLButtonElement>('.calendar-button');
      await click(buttons[1]);

      // It opens on the last day it allows, since today is past it: from + 364,
      // 365 days inclusive.
      expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
      const year = $<HTMLSelectElement>('.calendar select.figure')!;
      expect(year.selectedOptions[0].textContent?.trim()).toBe('2568');
      expect($<HTMLButtonElement>('[data-day="2025-12-31"]')!.disabled).toBe(
        false,
      );
      await click($$<HTMLButtonElement>('.calendar-step')[1]);
      expect($<HTMLButtonElement>('[data-day="2026-01-01"]')!.disabled).toBe(
        true,
      );
      await click($$<HTMLButtonElement>('.calendar-step')[0]);
      expect($('.calendar-foot')!.textContent).toContain(
        m.requester_calendar_cap_to(),
      );

      for (let i = 0; i < 11; i++) {
        await click($$<HTMLButtonElement>('.calendar-step')[0]);
      }
      expect($<HTMLButtonElement>('[data-day="2025-01-01"]')!.disabled).toBe(
        false,
      );
      await click($$<HTMLButtonElement>('.calendar-step')[0]);
      expect($<HTMLButtonElement>('[data-day="2024-12-31"]')!.disabled).toBe(
        true,
      );
    });

    it('sets the day picked from the calendar and closes it', async () => {
      await type('#date-from', '1/1/2568');
      await click($$<HTMLButtonElement>('.calendar-button')[1]);
      await click($<HTMLButtonElement>('[data-day="2025-12-31"]')!);

      expect($('.calendar')).toBeNull();
      expect($<HTMLInputElement>('#date-to')!.value).toBe('31 ธ.ค. 2568');
      expect(root.textContent).toContain(
        m.requester_dates_day_count({ days: 365 }),
      );
    });
  });

  describe('area selection', () => {
    const modes = () => $$('app-segmented button[role="radio"]');
    const cells = () => $$<HTMLButtonElement>('button.region-cell');

    it('offers the whole country or a province beside the map, whole country first', () => {
      expect(modes().map((b) => b.textContent?.trim())).toEqual([
        m.requester_area_national(),
        m.requester_area_province(),
      ]);
      expect(modes()[0].getAttribute('aria-checked')).toBe('true');
    });

    it('asks for a health region from the map, and shows the provinces it expands to', async () => {
      await click(cells()[0]);

      expect(cells()[0].getAttribute('aria-checked')).toBe('true');
      expect(
        modes().every((b) => b.getAttribute('aria-checked') === 'false'),
      ).toBe(true);
      expect(
        $$('[data-region-provinces] li').map((li) => li.textContent),
      ).toEqual(['เชียงใหม่', 'เชียงราย']);
    });

    it('keeps the map clickable in every mode, the 13 cells on the lattice', async () => {
      expect(cells()).toHaveLength(13);
      await click(modes()[1]);
      expect(cells()).toHaveLength(13);

      await click(cells()[0]);
      expect($('#province')).toBeNull();
      expect($('.area-headline')!.textContent).toContain(
        m.requester_area_region_selected({ region: 1 }),
      );
    });

    it('offers the province select only in province mode, and shows its region as context', async () => {
      expect($('#province')).toBeNull();
      await click(modes()[1]);
      const select = $<HTMLSelectElement>('#province')!;
      select.value = '50';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();

      expect(cells()[0].classList).toContain('related');
      expect(cells()[0].getAttribute('aria-checked')).toBe('false');
      expect($('.map-caption')).not.toBeNull();
      expect($('.area-headline')!.textContent).toContain('เชียงใหม่');
    });

    it('names cell 13 as Bangkok, since it sits out of reading order', () => {
      expect(cells()[12].getAttribute('aria-label')).toBe(
        m.requester_area_region_13_name(),
      );
    });
  });

  describe('the requirement checklist', () => {
    it('is always visible and counts an empty form as one of five', () => {
      expect(checkRows()).toHaveLength(5);
      expect($('[data-checklist]')!.textContent).toContain(
        m.requester_checklist_incomplete({ met: 1 }),
      );
    });

    it('says it is ready when all five are met', async () => {
      await fillEverything();

      expect($('[data-checklist]')!.textContent).toContain(
        m.requester_checklist_complete(),
      );
      expect($$('.meter .lit')).toHaveLength(3);
    });
  });

  describe('submit', () => {
    it('refuses an incomplete form, names what is missing, and keeps what was typed', async () => {
      await type('#c-name', 'Somchai');
      await submitForm();

      const checklist = $('[data-checklist]')!;
      expect(checklist.textContent).toContain(
        m.error_incomplete_title({ count: 7 }),
      );
      expect(checklist.textContent).toContain(m.error_incomplete_hint());
      expect(checklist.querySelectorAll('li button')).toHaveLength(4);
      expect($('#c-name')!.getAttribute('aria-invalid')).toBeNull();
      expect($<HTMLInputElement>('#c-name')!.value).toBe('Somchai');
      expect($('#c-email')!.getAttribute('aria-invalid')).toBe('true');
      http.expectNone('/api/requests');
    });

    it('jumps from a failing checklist item to its first missing field', async () => {
      await type('#c-name', 'Somchai');
      await submitForm();
      await tick();
      await click($<HTMLButtonElement>('[data-rule="identity"] button')!);

      expect(document.activeElement).toBe($('#c-surname'));
    });

    it('jumps from the area item to the province select in province mode', async () => {
      await click($$('app-segmented button[role="radio"]')[1]);
      await submitForm();
      await tick();
      await click($<HTMLButtonElement>('[data-rule="area"] button')!);

      expect(document.activeElement).toBe($('#province'));
    });

    it('will not go on without the privacy notice acknowledged, and says so', async () => {
      await fillEverything();
      const box = $<HTMLInputElement>('#consent')!;
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
      await submitForm();

      expect($('[data-check-email]')).toBeNull();
      expect(box.getAttribute('aria-invalid')).toBe('true');
      expect(root.textContent).toContain(m.error_consent_required());
      expect(checkRows()).toHaveLength(5);
    });

    it('clears every field with ล้างฟอร์ม', async () => {
      await fillEverything();
      await click(
        $$<HTMLButtonElement>('button').find((b) =>
          b.textContent?.includes(m.requester_clear_form()),
        )!,
      );

      expect($<HTMLInputElement>('#c-email')!.value).toBe('');
      expect($<HTMLInputElement>('#date-from')!.value).toBe('');
      expect($<HTMLInputElement>('#consent')!.checked).toBe(false);
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
      expect($<HTMLInputElement>('#date-to')!.value).toBe('31 ม.ค. 2568');
      expect($<HTMLSelectElement>('#group')!.value).toBe('group-2');
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
      expect(root.textContent).toContain(m.requester_duplicate_change_detail());
    });

    it('returns from the duplicate notice to the form with every field kept', async () => {
      await send();
      http
        .expectOne('/api/requests')
        .flush(
          { code: 'request_in_progress' },
          { status: 409, statusText: 'Conflict' },
        );
      await tick();

      await click(
        $$<HTMLButtonElement>('button').find((b) =>
          b.textContent?.includes(m.requester_duplicate_back()),
        )!,
      );

      expect($('form')).not.toBeNull();
      expect($<HTMLInputElement>('#c-email')!.value).toBe(
        'somchai@example.go.th',
      );
      expect($<HTMLInputElement>('#c-name')!.value).toBe('Somchai');
      expect($<HTMLInputElement>('#date-from')!.value).toBe('1 ม.ค. 2568');
      expect($<HTMLInputElement>('#date-to')!.value).toBe('31 ม.ค. 2568');
      expect($<HTMLSelectElement>('#group')!.value).toBe('group-2');
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
