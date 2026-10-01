import {
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A decision that needs one more deliberate press (system.md "Component:
// Dialog"): a card over a scrim, modal, with focus held inside it. The
// control marked `data-autofocus` takes focus when it opens (the confirm, or
// the reject note's textarea); Escape closes it and focus goes back to
// whatever opened it. While the confirm is loading the caller passes
// `dismissable` false: an approval that has gone cannot come back.
@Component({
  selector: 'app-dialog',
  template: `
    <div class="scrim" (mousedown)="holdFocus($event)">
      <div
        #panel
        class="dialog"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="labelledBy()"
        [style.width.px]="width()"
        (keydown)="onKey($event)"
      >
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 20;
      display: grid;
      place-items: center;
      padding: 24px;
      background: color-mix(in srgb, var(--foreground) 45%, transparent);
    }
    .dialog {
      display: flex;
      flex-direction: column;
      gap: 20px;
      max-width: 100%;
      max-height: calc(100vh - 48px);
      overflow: auto;
      padding: 32px;
      background: var(--card);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-dialog);
    }
  `,
})
export class Dialog implements OnDestroy {
  readonly labelledBy = input.required<string>();
  readonly width = input(520);
  readonly dismissable = input(true);
  readonly dismissed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly returnTo = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      const panel = this.panel().nativeElement;
      const first =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    });
  }

  ngOnDestroy(): void {
    // Back to the trigger, when it is still on the page to go back to.
    if (this.returnTo?.isConnected) this.returnTo.focus();
  }

  /** A press on the scrim itself would move focus to the page behind. */
  protected holdFocus(event: MouseEvent): void {
    if (event.target === event.currentTarget) event.preventDefault();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.dismissable()) this.dismissed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...this.panel().nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE),
    ];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
