import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { RequestFormPage } from './request-form.page.js';

describe('RequestFormPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestFormPage],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('renders the page in order: gate notice, de-identification block, notices, then the form', async () => {
    const fixture = TestBed.createComponent(RequestFormPage);
    await fixture.whenStable();
    const main = fixture.nativeElement.querySelector('main.page') as HTMLElement;
    const topLevel = Array.from(main.children) as HTMLElement[];

    const introIndex = topLevel.findIndex((el) => el.classList.contains('intro'));
    const deidIndex = topLevel.findIndex((el) => el.classList.contains('deid'));
    const noticesIndex = topLevel.findIndex((el) =>
      el.classList.contains('notices'),
    );
    const formIndex = topLevel.findIndex((el) => el.tagName === 'FORM');

    expect(introIndex).toBeGreaterThanOrEqual(0);
    expect(deidIndex).toBeGreaterThan(introIndex);
    expect(noticesIndex).toBeGreaterThan(deidIndex);
    expect(formIndex).toBeGreaterThan(noticesIndex);
  });

  it('orders the form sections: disease group, date range, area, contact, then submit', async () => {
    const fixture = TestBed.createComponent(RequestFormPage);
    await fixture.whenStable();
    const form = fixture.nativeElement.querySelector('form.form') as HTMLElement;
    const sections = Array.from(form.children);

    expect(sections[0].querySelector('.disease-group-grid')).toBeTruthy();
    expect(sections[1].querySelector('.date-row')).toBeTruthy();
    expect(sections[2].querySelector('.segmented')).toBeTruthy();
    expect(sections[3].querySelector('.contact-grid')).toBeTruthy();
    expect(
      (sections[sections.length - 1] as HTMLElement).classList.contains(
        'form-footer',
      ),
    ).toBe(true);
  });

  it('renders the de-identification block open, with no interaction needed to read it', async () => {
    const fixture = TestBed.createComponent(RequestFormPage);
    await fixture.whenStable();
    const deid = fixture.nativeElement.querySelector('.deid') as HTMLElement;
    const columns = deid.querySelector('.deid__columns') as HTMLElement;

    expect(columns).toBeTruthy();
    expect(columns.children.length).toBe(2);
    expect(columns.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('shows the region provinces before submit once a health region is picked', async () => {
    const fixture = TestBed.createComponent(RequestFormPage);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.region-provinces')).toBeNull();

    const regionRadio = compiled.querySelector(
      'input[name="areaKind"][value="region"]',
    ) as HTMLInputElement;
    regionRadio.checked = true;
    regionRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    const regionSelect = fixture.nativeElement.querySelector(
      'select',
    ) as HTMLSelectElement;
    regionSelect.value = '8';
    regionSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    const provinces = fixture.nativeElement.querySelector(
      '.region-provinces',
    ) as HTMLElement;
    expect(provinces).toBeTruthy();
    expect(provinces.querySelectorAll('.tag').length).toBeGreaterThan(1);
  });
});
