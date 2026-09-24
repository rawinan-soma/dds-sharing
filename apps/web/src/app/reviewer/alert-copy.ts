import * as m from '../../paraglide/messages.js';
import { type AlertKind, type AlertOutcome } from './queue-api';

// The words for each Alert kind and each closed-set outcome, from the
// catalogue. One place, so the zone's card and the open Alert cannot name the
// same thing two ways.

export function alertTitle(kind: AlertKind): string {
  switch (kind) {
    case 'collection_lapse':
      return m.reviewer_alert_lapse_title();
    case 'send_abandoned':
      return m.reviewer_alert_send_abandoned_title();
    case 'extraction_failure':
      return m.reviewer_alert_extraction_title();
  }
}

export function outcomeLabel(outcome: AlertOutcome): string {
  switch (outcome) {
    case 'reached_requester':
      return m.reviewer_alert_outcome_reached();
    case 'could_not_reach_requester':
      return m.reviewer_alert_outcome_unreachable();
    case 'no_action_needed':
      return m.reviewer_alert_outcome_no_action();
    case 'contacted_requester':
      return m.reviewer_alert_outcome_contacted();
    case 'abandoned':
      return m.reviewer_alert_outcome_abandoned();
  }
}
