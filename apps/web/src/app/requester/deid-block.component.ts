import { Component } from '@angular/core';
import * as m from '../../paraglide/messages.js';

// What the file will and will not contain. A Requester who never reads it
// receives a CSV with no names in it and files it as broken, so this is open,
// static and above the form — no disclosure, no interaction (spec §16.4). What
// is left out is not styled as an error: a ringed inert dash, not a cross.
@Component({
  selector: 'app-deid-block',
  template: `
    <section class="card contents" aria-labelledby="deid-heading">
      <h2 id="deid-heading" class="card-title">
        {{ m.requester_deid_heading() }}
      </h2>
      <div class="contents-columns">
        <div class="included">
          <h3>{{ m.requester_deid_included_heading() }}</h3>
          <ul>
            @for (item of included; track $index) {
              <li>
                <span class="mark tick" aria-hidden="true">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M2.5 6.2 5 8.5l4.5-5" />
                  </svg>
                </span>
                {{ item() }}
              </li>
            }
          </ul>
        </div>
        <div class="excluded">
          <h3>{{ m.requester_deid_excluded_heading() }}</h3>
          <ul>
            @for (item of excluded; track $index) {
              <li>
                <span class="mark dash" aria-hidden="true">
                  <svg
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                  >
                    <path d="M3.5 6h5" />
                  </svg>
                </span>
                {{ item() }}
              </li>
            }
          </ul>
        </div>
      </div>
    </section>
  `,
})
export class DeidBlock {
  protected readonly m = m;
  protected readonly included = [
    m.requester_deid_included_1,
    m.requester_deid_included_2,
    m.requester_deid_included_3,
    m.requester_deid_included_4,
    m.requester_deid_included_5,
    m.requester_deid_included_6,
    m.requester_deid_included_7,
  ];
  protected readonly excluded = [
    m.requester_deid_excluded_1,
    m.requester_deid_excluded_2,
    m.requester_deid_excluded_3,
    m.requester_deid_excluded_4,
    m.requester_deid_excluded_5,
    m.requester_deid_excluded_6,
  ];
}
