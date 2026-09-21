import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { formatDay } from './format-day';
import { SubmissionState } from './submission-state';

// The confirmation. It reads as "you are done", never "something went wrong":
// no error styling anywhere. Reached only from a successful submit; a Requester
// who lands here cold, or reloads, is sent to the form, because the page holds
// nothing in its address and so has nothing to rebuild itself from (§16.2).
@Component({
  selector: 'app-submitted-page',
  template: `
    @if (submission(); as s) {
      <div class="page prose stack" style="padding: 32px 16px 64px">
        <h1 tabindex="-1">{{ m.requester_confirm_title() }}</h1>
        <p>{{ m.requester_confirm_lead() }}</p>

        <div class="panel-primary">
          <p class="muted small">{{ m.requester_confirm_reference_label() }}</p>
          <p class="display figure" data-reference>{{ s.reference }}</p>
          <p>{{ m.requester_confirm_keep_number() }}</p>
        </div>

        <h2>{{ m.requester_confirm_ask_heading() }}</h2>
        <dl class="fact-list">
          <div>
            <dt>{{ m.requester_group_heading() }}</dt>
            <dd>{{ s.diseaseGroupName }}</dd>
          </div>
          <div>
            <dt>{{ m.requester_dates_heading() }}</dt>
            <dd class="figure">
              <time [attr.datetime]="s.from">{{ formatDay(s.from) }}</time>
              –
              <time [attr.datetime]="s.to">{{ formatDay(s.to) }}</time>
            </dd>
          </div>
          <div>
            <dt>{{ m.requester_area_heading() }}</dt>
            <dd>{{ s.areaLabel }}</dd>
          </div>
        </dl>

        <div class="two-up">
          <div class="notice">
            <h2 class="small">{{ m.requester_confirm_decision_heading() }}</h2>
            <p>{{ m.requester_confirm_decision_detail() }}</p>
          </div>
          <div class="notice">
            <h2 class="small">{{ m.requester_confirm_approved_heading() }}</h2>
            <p>{{ m.requester_confirm_approved_detail() }}</p>
          </div>
        </div>

        <p>
          {{ m.requester_confirm_contact({ telephone: m.app_telephone() }) }}
        </p>
      </div>
    }
  `,
})
export class SubmittedPage implements OnInit {
  protected readonly m = m;
  protected readonly formatDay = formatDay;
  protected readonly submission = inject(SubmissionState).current;
  private readonly router = inject(Router);

  ngOnInit() {
    if (!this.submission())
      void this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
