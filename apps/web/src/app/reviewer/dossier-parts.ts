import {
  Component,
  ElementRef,
  type Injector,
  afterNextRender,
  input,
} from '@angular/core';
import * as m from '../../paraglide/messages.js';
import { formatDay } from '../requester/format-day';
import { type Dossier } from './queue-api';

// The pieces every Reviewer dossier is built from, so the queue's dossier, an
// Alert, an in-flight Request and a looked-up record cannot drift apart.

export type Contact = Dossier['contact'];

/** The Requester's name as the dossier headline and the dialogs give it. */
export const fullName = (who: Pick<Contact, 'name' | 'surname'>): string =>
  `${who.name} ${who.surname}`;

/** An inclusive date range on one line, for text that cannot hold <time>. */
export const dateRangeText = (start: string, end: string): string =>
  `${formatDay(start)} – ${formatDay(end)}`;

/**
 * Selecting a Request moves focus to its heading, so a keyboard user lands on
 * what they picked rather than back in the list. Every dossier marks that
 * heading as its first focusable `h2`; `injector` is the dossier component's
 * own, which also hands over its host element.
 */
export function focusHeadingAfterRender(injector: Injector): void {
  const host = injector.get<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  afterNextRender(
    () => host.querySelector<HTMLElement>('h2[tabindex="-1"]')?.focus(),
    { injector },
  );
}

// The five contact fields, one row each, as screen 5 and 6b draw them.
@Component({
  selector: 'app-contact-rows',
  template: `
    <dl class="rows compact">
      <div>
        <dt>{{ copy.firstName }}</dt>
        <dd>{{ contact().name }}</dd>
      </div>
      <div>
        <dt>{{ copy.lastName }}</dt>
        <dd>{{ contact().surname }}</dd>
      </div>
      <div>
        <dt>{{ copy.workplace }}</dt>
        <dd>{{ contact().workplace }}</dd>
      </div>
      <div>
        <dt>{{ copy.telephone }}</dt>
        <dd class="figure">{{ contact().tel }}</dd>
      </div>
      <div>
        <dt>{{ copy.email }}</dt>
        <dd class="email">{{ contact().email }}</dd>
      </div>
    </dl>
  `,
  styles: `
    .email {
      overflow-wrap: anywhere;
    }
  `,
})
export class ContactRows {
  readonly contact = input.required<Contact>();
  protected readonly copy = {
    firstName: m.requester_first_name(),
    lastName: m.requester_last_name(),
    workplace: m.requester_workplace(),
    telephone: m.reviewer_dossier_telephone(),
    email: m.reviewer_dossier_email(),
  };
}

// An inclusive date range, each end a <time> carrying its Gregorian date.
@Component({
  selector: 'app-date-range',
  template: `<time [attr.datetime]="start()">{{ day(start()) }}</time>
    –
    <time [attr.datetime]="end()">{{ day(end()) }}</time>`,
})
export class DateRange {
  readonly start = input.required<string>();
  readonly end = input.required<string>();
  protected readonly day = formatDay;
}

// The one sentence a dossier shows in its own place when there is nothing to
// show: the Request has gone, or could not be read. Focusable like any
// dossier heading; `announce` when it reports a failure, so it is read out.
@Component({
  selector: 'app-dossier-message',
  template: `
    <div class="dossier-message">
      <h2 tabindex="-1" [attr.role]="announce() ? 'alert' : null">
        {{ text() }}
      </h2>
    </div>
  `,
})
export class DossierMessage {
  readonly text = input.required<string>();
  readonly announce = input(false);
}
