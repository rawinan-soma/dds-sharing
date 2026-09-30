// PROTOTYPE — wipe me.
// Variant B of the Requester form ("Map-first split"), the one chosen and
// locked into docs/design/system.md, on the existing `/` route behind
// `?variant=`. Without `?variant=` the real page renders.
import { Component, computed, inject } from '@angular/core';
import { ProtoForm } from './proto-form';
import { ProtoToasts } from './proto-toasts';
import { VariantB } from './variant-b';

@Component({
  selector: 'app-request-form-prototype',
  imports: [ProtoToasts, VariantB],
  providers: [ProtoForm],
  template: `
    <app-variant-b />
    <app-proto-toasts />
    <details class="proto-state">
      <summary>state</summary>
      <pre>{{ state() }}</pre>
    </details>
  `,
  styles: `
    .proto-state {
      position: fixed;
      left: 16px;
      bottom: 16px;
      z-index: 1000;
      max-width: 360px;
      max-height: 60vh;
      overflow: auto;
      background: #111;
      color: #cfe;
      border-radius: 10px;
      font:
        11px/1.4 ui-monospace,
        monospace;
      padding: 6px 10px;
    }
    summary {
      cursor: pointer;
      color: #fff;
    }
    pre {
      margin: 6px 0 0;
      white-space: pre-wrap;
    }
  `,
})
export class RequestFormPrototype {
  private readonly s = inject(ProtoForm);

  protected readonly state = computed(() =>
    JSON.stringify(
      {
        form: this.s.form(),
        problems: this.s.problems(),
        days: this.s.days(),
        area: this.s.areaLabel(),
      },
      null,
      2,
    ),
  );
}
