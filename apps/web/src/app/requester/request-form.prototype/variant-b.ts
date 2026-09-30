// PROTOTYPE — wipe me. Variant B, "Map-first split": docs/example-ui/login.jpg.
// The map is the hero and always clickable; beside it one quiet card with an
// icon header, stacked labelled fields, and a live "must contain" checklist with
// a segmented strength bar in place of an error summary.
import { Component, computed, inject } from '@angular/core';
import { RegionMap } from '../region-map.component';
import { ProtoForm } from './proto-form';

@Component({
  selector: 'app-variant-b',
  imports: [RegionMap],
  template: `
    <div class="split">
      <aside class="map-pane">
        <p class="eyebrow">พื้นที่ที่ขอ</p>
        <h2>{{ s.areaLabel() }}</h2>
        <div class="area-buttons">
          <button
            type="button"
            [class.on]="f().areaMode === 'national'"
            (click)="s.set({ areaMode: 'national' })"
          >
            ทั้งประเทศ
          </button>
          <button
            type="button"
            [class.on]="f().areaMode === 'province'"
            (click)="s.set({ areaMode: 'province' })"
          >
            เลือกจังหวัด
          </button>
        </div>

        <app-region-map
          [interactive]="true"
          [selected]="s.mapRegion()"
          (picked)="s.pickRegion($event)"
        />
        <p class="tip">กดเขตบนแผนที่เพื่อขอทั้งเขตสุขภาพ</p>

        @if (f().areaMode === 'province') {
          <label class="lbl" for="b-prov">จังหวัด<em>*</em></label>
          <select
            id="b-prov"
            class="box"
            [class.bad]="s.error('area')"
            (change)="s.set({ provinceId: $any($event.target).value })"
          >
            <option value="" [selected]="!f().provinceId">เลือกจังหวัด…</option>
            @for (p of s.reference().provinces; track p.provinceId) {
              <option
                [value]="p.provinceId"
                [selected]="p.provinceId === f().provinceId"
              >
                {{ p.nameTh }} · เขต {{ p.healthRegion }}
              </option>
            }
          </select>
        }
        @if (f().areaMode === 'region' && s.regionList().length) {
          <p class="tip">
            เก็บเป็น {{ s.regionList().length }} จังหวัด ไม่ใช่เลขเขต
          </p>
          <ul class="chips">
            @for (p of s.regionList(); track p.provinceId) {
              <li>{{ p.nameTh }}</li>
            }
          </ul>
        }
      </aside>

      <form class="card" novalidate (submit)="submit($event)">
        <header>
          <span class="badge" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
            >
              <path
                d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
              />
              <path d="M14 3v5h5M9 13h6M9 17h4" />
            </svg>
          </span>
          <div>
            <h1>ขอข้อมูลเฝ้าระวังโรค</h1>
            <p>
              ข้อมูลรายบุคคลแบบไม่ระบุตัวตน
              ผ่านการอนุมัติจากเจ้าหน้าที่ก่อนทุกครั้ง
            </p>
          </div>
        </header>

        <label class="lbl" for="b-group">กลุ่มโรค<em>*</em></label>
        <select
          id="b-group"
          class="box"
          [class.bad]="s.error('diseaseGroupId')"
          (change)="
            s.set({ diseaseGroupId: $any($event.target).value || null })
          "
        >
          <option value="" [selected]="!f().diseaseGroupId">
            เลือกหนึ่งกลุ่ม…
          </option>
          @for (g of s.reference().diseaseGroups; track g.id) {
            <option [value]="g.id" [selected]="g.id === f().diseaseGroupId">
              {{ g.name }}
            </option>
          }
        </select>

        <div class="row">
          <div>
            <label class="lbl" for="b-from">ตั้งแต่<em>*</em></label>
            <input
              id="b-from"
              type="date"
              class="box"
              [class.bad]="s.error('from')"
              [value]="f().from"
              (input)="s.text('from', $event)"
            />
          </div>
          <div>
            <label class="lbl" for="b-to">
              ถึง<em>*</em>
              @if (s.days(); as d) {
                <span class="aside">{{ d }} วัน</span>
              }
            </label>
            <input
              id="b-to"
              type="date"
              class="box"
              [class.bad]="s.error('to') || s.problems().spanTooLong"
              [value]="f().to"
              [attr.min]="f().from || null"
              [attr.max]="s.toMax()"
              (input)="s.text('to', $event)"
            />
          </div>
        </div>

        <div class="rule"></div>

        <div class="row">
          <div>
            <label class="lbl" for="b-name">ชื่อ<em>*</em></label>
            <input
              id="b-name"
              class="box"
              autocomplete="given-name"
              [class.bad]="s.error('name')"
              [value]="f().name"
              (input)="s.text('name', $event)"
            />
          </div>
          <div>
            <label class="lbl" for="b-surname">นามสกุล<em>*</em></label>
            <input
              id="b-surname"
              class="box"
              autocomplete="family-name"
              [class.bad]="s.error('surname')"
              [value]="f().surname"
              (input)="s.text('surname', $event)"
            />
          </div>
        </div>
        <label class="lbl" for="b-work">หน่วยงาน<em>*</em></label>
        <input
          id="b-work"
          class="box"
          autocomplete="organization"
          placeholder="เช่น สคร.1 เชียงใหม่ กลุ่มระบาดวิทยา"
          [class.bad]="s.error('workplace')"
          [value]="f().workplace"
          (input)="s.text('workplace', $event)"
        />
        <label class="lbl" for="b-tel">โทรศัพท์ที่ท่านรับสาย<em>*</em></label>
        <input
          id="b-tel"
          class="box"
          type="tel"
          autocomplete="tel"
          [class.bad]="s.error('tel')"
          [value]="f().tel"
          (input)="s.text('tel', $event)"
        />
        <label class="lbl" for="b-email">
          อีเมลรับไฟล์<em>*</em>
          @if (f().email) {
            <button
              type="button"
              class="aside link"
              (click)="s.set({ email: '' })"
            >
              ล้าง
            </button>
          }
        </label>
        <input
          id="b-email"
          class="box"
          autocomplete="email"
          [class.bad]="s.error('email')"
          [value]="f().email"
          (input)="s.text('email', $event)"
        />

        <div class="meter" aria-hidden="true">
          @for (on of segments(); track $index) {
            <span [style.background]="on ? meterColor() : null"></span>
          }
        </div>
        <p class="meter-label">{{ meterLabel() }} ต้องมี;</p>
        <ul class="checks">
          @for (c of checks(); track c.label) {
            <li [class.ok]="c.ok">
              <span class="tick">{{ c.ok ? '✓' : '×' }}</span
              >{{ c.label }}
            </li>
          }
        </ul>

        <div class="actions">
          <button type="button" class="btn ghost" (click)="s.reset()">
            ล้างฟอร์ม
          </button>
          <button type="submit" class="btn solid">ส่งคำขอ</button>
        </div>
      </form>
    </div>
  `,
  styles: `
    :host {
      --blue: #3b5bfd;
      --line: #dfe1e6;
      --ink: #1b1d24;
      --sub: #6b6f7a;
      display: block;
      background: #e4e6ea;
      min-height: calc(100vh - 80px);
    }
    .split {
      max-width: 1080px;
      margin: 0 auto;
      padding: 40px 16px 96px;
      display: grid;
      grid-template-columns: 1fr 460px;
      gap: 32px;
      align-items: start;
    }
    .map-pane {
      position: sticky;
      top: 24px;
      display: grid;
      gap: 12px;
      justify-items: start;
    }
    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.08em;
      color: var(--sub);
    }
    .map-pane h2 {
      font-size: 32px;
      font-weight: 600;
      color: var(--ink);
    }
    .area-buttons {
      display: flex;
      gap: 8px;
    }
    .area-buttons button {
      all: unset;
      cursor: pointer;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid #c9ccd3;
      background: #fff;
      font-size: 13px;
    }
    .area-buttons button.on {
      border-color: var(--blue);
      color: var(--blue);
      background: #eef1ff;
    }
    :host ::ng-deep .region-map {
      grid-template-columns: repeat(5, 72px);
      grid-template-rows: repeat(7, 56px);
      gap: 6px;
    }
    :host ::ng-deep .region-cell {
      display: grid;
      place-items: center;
      border-radius: 12px;
      background: #fff !important;
      border: 1px solid var(--line) !important;
      font-size: 16px;
      font-weight: 600;
      color: var(--sub);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
      transition: transform 0.1s;
    }
    :host ::ng-deep button.region-cell:hover {
      transform: translateY(-2px);
      border-color: var(--blue) !important;
      color: var(--blue);
    }
    :host ::ng-deep .region-cell[aria-checked='true'] {
      background: var(--blue) !important;
      border-color: var(--blue) !important;
      color: #fff;
    }
    .tip {
      font-size: 12px;
      color: var(--sub);
    }
    .chips {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      max-width: 400px;
    }
    .chips li {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 12px;
    }
    .card {
      background: #fff;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 30px 60px rgb(0 0 0 / 0.06);
      display: grid;
      gap: 6px;
    }
    header {
      display: flex;
      gap: 16px;
      align-items: center;
      padding-bottom: 20px;
      margin-bottom: 12px;
      border-bottom: 1px solid var(--line);
    }
    .badge {
      flex: none;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: 1px solid var(--line);
      display: grid;
      place-items: center;
      color: var(--ink);
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
    }
    header p {
      font-size: 13px;
      color: var(--sub);
    }
    .lbl {
      display: flex;
      align-items: baseline;
      font-size: 14px;
      font-weight: 500;
      margin-top: 8px;
    }
    .lbl em {
      color: var(--blue);
      font-style: normal;
    }
    .aside {
      margin-left: auto;
      font-size: 12px;
      color: var(--sub);
      font-weight: 400;
    }
    .link {
      all: unset;
      margin-left: auto;
      font-size: 12px;
      color: var(--sub);
      cursor: pointer;
    }
    .box {
      font: inherit;
      font-size: 14px;
      width: 100%;
      height: 44px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      color: var(--ink);
    }
    .box:focus {
      outline: 2px solid rgb(59 91 253 / 0.25);
      border-color: var(--blue);
    }
    .box.bad {
      border-color: #d23b4b;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .rule {
      height: 1px;
      background: var(--line);
      margin: 12px 0 4px;
    }
    .meter {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 16px;
    }
    .meter span {
      height: 4px;
      border-radius: 2px;
      background: #e3e5ea;
    }
    .meter-label {
      font-size: 13px;
      color: var(--sub);
      margin-top: 4px;
    }
    .checks {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 4px;
      font-size: 13px;
      color: var(--sub);
    }
    .tick {
      display: inline-grid;
      place-items: center;
      width: 16px;
      height: 16px;
      margin-right: 8px;
      border-radius: 50%;
      background: #8a8e98;
      color: #fff;
      font-size: 10px;
    }
    .ok .tick {
      background: #34c38f;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1.2fr;
      gap: 12px;
      margin-top: 16px;
    }
    .btn {
      font: inherit;
      height: 44px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 15px;
    }
    .ghost {
      background: #fff;
      border: 1px solid var(--line);
    }
    .solid {
      background: var(--blue);
      border: none;
      color: #fff;
    }
    @media (max-width: 900px) {
      .split {
        grid-template-columns: 1fr;
      }
      .map-pane {
        position: static;
      }
      :host ::ng-deep .region-map {
        grid-template-columns: repeat(5, 52px);
        grid-template-rows: repeat(7, 42px);
      }
    }
  `,
})
export class VariantB {
  protected readonly s = inject(ProtoForm);
  protected readonly f = this.s.form;

  protected readonly checks = computed(() => {
    const miss = this.s.missing();
    const p = this.s.problems();
    return [
      { label: 'เลือกกลุ่มโรค 1 กลุ่ม', ok: !miss.has('diseaseGroupId') },
      {
        label: 'ช่วงวันที่ไม่เกิน 365 วัน',
        ok:
          !miss.has('from') && !miss.has('to') && !p.spanTooLong && !p.reversed,
      },
      { label: 'ระบุพื้นที่ (หรือทั้งประเทศ)', ok: !miss.has('area') },
      {
        label: 'ชื่อ นามสกุล และหน่วยงาน',
        ok: !miss.has('name') && !miss.has('surname') && !miss.has('workplace'),
      },
      {
        label: 'โทรศัพท์และอีเมลที่ติดต่อได้จริง',
        ok: !miss.has('tel') && !miss.has('email'),
      },
    ];
  });
  private readonly score = computed(
    () => this.checks().filter((c) => c.ok).length,
  );
  protected readonly segments = computed(() => {
    const n = this.score();
    const lit = n === 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
    return [lit >= 1, lit >= 2, lit >= 3];
  });
  protected readonly meterColor = computed(() =>
    this.score() === 5 ? '#34c38f' : this.score() >= 3 ? '#f0a92e' : '#d23b4b',
  );
  protected readonly meterLabel = computed(() =>
    this.score() === 5
      ? 'พร้อมส่ง ครบทุกข้อ'
      : `คำขอยังไม่ครบ (${this.score()}/5)`,
  );

  protected submit(event: Event) {
    event.preventDefault();
    this.s.send();
  }
}
