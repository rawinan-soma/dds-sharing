import { Component, ElementRef, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import * as m from '../../paraglide/messages.js';
import { formatDay } from './format-day';
import { PhoneText } from './phone-text.component';
import { SubmissionState } from './submission-state';

// The confirmation. It reads as "you are done", never "something went wrong":
// no error styling anywhere. Reached only from a successful submit; a Requester
// who lands here cold, or reloads, is sent to the form, because the page holds
// nothing in its address and so has nothing to rebuild itself from (§16.2).
@Component({
  selector: 'app-submitted-page',
  imports: [PhoneText],
  template: `
    @if (submission(); as s) {
      <div class="single">
        <div class="card">
          <div class="status-head">
            <span class="status-mark success" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.5 10 17l9-10" />
              </svg>
            </span>
            <div>
              <h1 tabindex="-1">{{ m.requester_confirm_title() }}</h1>
              <p class="muted">{{ m.requester_confirm_lead() }}</p>
            </div>
          </div>

          <div class="panel panel-primary">
            <p class="muted small">
              {{ m.requester_confirm_reference_label() }}
            </p>
            <p class="display figure" data-reference>{{ s.reference }}</p>
            <p class="panel-line">
              {{ m.requester_confirm_keep_number() }}
            </p>
          </div>

          <section>
            <h2 class="section-title">
              {{ m.requester_confirm_ask_heading() }}
            </h2>
            <dl class="rows">
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
          </section>

          <div class="info-notes">
            <div class="info-note">
              <h2>{{ m.requester_confirm_decision_heading() }}</h2>
              <p>{{ m.requester_confirm_decision_detail() }}</p>
            </div>
            <div class="info-note">
              <h2>{{ m.requester_confirm_approved_heading() }}</h2>
              <p>{{ m.requester_confirm_approved_detail() }}</p>
            </div>
          </div>

          <p class="phone-line">
            <app-phone-text
              [text]="
                m.requester_confirm_contact({ telephone: m.app_telephone() })
              "
            />
          </p>
        </div>
      </div>
    }
  `,
})
export class SubmittedPage implements OnInit {
  protected readonly m = m;
  protected readonly formatDay = formatDay;
  protected readonly submission = inject(SubmissionState).current;
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnInit() {
    if (!this.submission())
      void this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
