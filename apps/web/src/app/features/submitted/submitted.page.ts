import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import * as m from '../../../paraglide/messages.js';
import type {
  DuplicateRequestResponse,
  NormalizedArea,
  SubmitRequestResponse,
} from '../../requests-api/requests-api.types.js';

type SubmittedNavigationState =
  | ({ kind: 'acknowledged' } & SubmitRequestResponse)
  | ({ kind: 'duplicate' } & DuplicateRequestResponse)
  | undefined;

const STATE_LABELS: Record<string, () => string> = {
  pending: m.requester_state_pending,
  queued: m.requester_state_queued,
  running: m.requester_state_running,
  ready: m.requester_state_ready,
  delivered: m.requester_state_delivered,
  failed: m.requester_state_failed,
};

@Component({
  selector: 'app-submitted-page',
  imports: [],
  templateUrl: './submitted.page.html',
  styleUrl: './submitted.page.scss',
})
export class SubmittedPage {
  private readonly location = inject(Location);

  protected readonly m = m;
  protected readonly telephone = m.requester_service_telephone();

  private readonly navState =
    (this.location.getState() as SubmittedNavigationState) ?? undefined;

  protected readonly kind = this.navState?.kind;

  protected readonly acknowledged =
    this.navState?.kind === 'acknowledged' ? this.navState : null;
  protected readonly duplicate =
    this.navState?.kind === 'duplicate' ? this.navState : null;

  protected areaSummary(area: NormalizedArea): string {
    if (area.kind === 'national') return m.requester_area_national_label();
    if (area.kind === 'province') return area.nameTh;
    return m.requester_area_region_value_label({ region: area.region });
  }

  protected duplicateStateLabel(state: string): string {
    return (STATE_LABELS[state] ?? (() => state))();
  }

  protected formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}
