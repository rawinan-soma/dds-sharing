import { Component } from '@angular/core';
import * as m from '../../paraglide/messages.js';

// What the file will and will not contain. A Requester who never opens it
// receives a CSV with no names in it and files it as broken, so this is open,
// static and above the form — no disclosure, no interaction (spec §16.4).
@Component({
  selector: 'app-deid-block',
  template: `
    <section class="section" aria-labelledby="deid-heading">
      <div class="kicker">
        <h2 id="deid-heading">{{ m.requester_deid_heading() }}</h2>
        <span class="muted small">{{ m.requester_deid_column_count() }}</span>
      </div>
      <p class="prose">{{ m.requester_deid_lead() }}</p>
      <div class="two-up" style="margin-top: 16px">
        <div>
          <h3>{{ m.requester_deid_included_heading() }}</h3>
          <ul class="plain-list" style="margin-top: 8px">
            @for (item of included; track $index) {
              <li>{{ item() }}</li>
            }
          </ul>
        </div>
        <div>
          <h3>{{ m.requester_deid_excluded_heading() }}</h3>
          <ul class="plain-list" style="margin-top: 8px">
            @for (item of excluded; track $index) {
              <li>{{ item() }}</li>
            }
          </ul>
        </div>
      </div>
      <p class="prose muted small" style="margin-top: 8px">
        {{ m.requester_deid_allowlist_note() }}
      </p>
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
