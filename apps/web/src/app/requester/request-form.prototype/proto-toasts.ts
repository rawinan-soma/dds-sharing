// PROTOTYPE — wipe me. The tinted toast from docs/example-ui/toast, top-right.
import { Component, inject } from '@angular/core';
import { ProtoForm } from './proto-form';

@Component({
  selector: 'app-proto-toasts',
  template: `
    <div class="stack" aria-live="polite">
      @for (t of state.toasts(); track t.id) {
        <div class="toast" [attr.data-kind]="t.kind">
          <span class="icon" aria-hidden="true">{{ icons[t.kind] }}</span>
          <div class="text">
            <strong>{{ t.title }}</strong>
            <span>{{ t.detail }}</span>
          </div>
          <button type="button" aria-label="ปิด" (click)="state.dismiss(t.id)">
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 900;
      display: grid;
      gap: 12px;
      width: min(380px, calc(100vw - 32px));
    }
    .toast {
      display: grid;
      grid-template-columns: 28px 1fr 20px;
      gap: 12px;
      align-items: center;
      padding: 12px 16px;
      border-radius: 14px;
      border: 1px solid var(--t-border);
      background: var(--t-bg);
      color: var(--t-fg);
      box-shadow: 0 8px 24px var(--t-glow);
      backdrop-filter: blur(8px);
      animation: in 0.25s ease-out;
    }
    [data-kind='success'] {
      --t-bg: #e6f6ec;
      --t-border: #a7dfbb;
      --t-fg: #1e7a44;
      --t-glow: rgb(46 160 90 / 0.15);
    }
    [data-kind='warning'] {
      --t-bg: #fdf3dc;
      --t-border: #f1d58f;
      --t-fg: #7a5a00;
      --t-glow: rgb(220 170 40 / 0.18);
    }
    [data-kind='info'] {
      --t-bg: #e3ecfd;
      --t-border: #a9c3f5;
      --t-fg: #2c5bc9;
      --t-glow: rgb(60 110 230 / 0.15);
    }
    [data-kind='error'] {
      --t-bg: #fbe6e1;
      --t-border: #f0b3a6;
      --t-fg: #b3261e;
      --t-glow: rgb(200 60 40 / 0.15);
    }
    .icon {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid currentColor;
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: 14px;
    }
    .text {
      display: grid;
      line-height: 1.35;
    }
    .text span {
      font-size: 13px;
      opacity: 0.85;
    }
    button {
      all: unset;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
    }
    @keyframes in {
      from {
        opacity: 0;
        transform: translateY(-8px);
      }
    }
  `,
})
export class ProtoToasts {
  protected readonly state = inject(ProtoForm);
  protected readonly icons = {
    success: '✓',
    warning: '!',
    info: 'i',
    error: '×',
  };
}
