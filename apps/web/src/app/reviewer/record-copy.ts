import * as m from '../../paraglide/messages.js';
import { linkLeft } from './in-flight-copy';
import {
  type RecordEvent,
  type RecordFile,
  type RequestEventType,
  type TerminalState,
} from './queue-api';

// The words for a terminal Request's record (spec §10.10), from the catalogue.
// Every state is a word, never a colour alone.

export function terminalStateWord(state: TerminalState): string {
  switch (state) {
    case 'collected':
      return m.reviewer_state_collected();
    case 'expired_uncollected':
      return m.reviewer_state_expired_uncollected();
    case 'rejected':
      return m.reviewer_state_rejected();
    case 'abandoned':
      return m.reviewer_state_abandoned();
    case 'expired':
      return m.reviewer_clock_expired();
  }
}

/** How a file's link reads now; a live one shows its wall-clock time left. */
export function linkWord(file: RecordFile, now: number): string {
  switch (file.link) {
    case 'live':
      return m.reviewer_inflight_link_left({
        time: linkLeft(file.expiresAt, now),
      });
    case 'used_up':
      return m.reviewer_lookup_link_used_up();
    case 'expired':
      return m.reviewer_lookup_link_expired();
    case 'revoked':
      return m.reviewer_lookup_link_revoked();
  }
}

/** Who did it: a Reviewer by name, anyone else by what they were. */
export function actorWord(event: RecordEvent): string {
  switch (event.actor) {
    case 'reviewer':
      return event.reviewer ?? '';
    case 'requester':
      return m.reviewer_actor_requester();
    case 'system':
      return m.reviewer_actor_system();
    case 'anonymous':
      return m.reviewer_actor_anonymous();
  }
}

export function eventWord(type: RequestEventType): string {
  switch (type) {
    case 'submitted':
      return m.reviewer_event_submitted();
    case 'probe_performed':
      return m.reviewer_event_probe_performed();
    case 'probe_failed':
      return m.reviewer_event_probe_failed();
    case 'approved':
      return m.reviewer_event_approved();
    case 'rejected':
      return m.reviewer_event_rejected();
    case 'note_amended':
      return m.reviewer_event_note_amended();
    case 'expired':
      return m.reviewer_event_expired();
    case 'job_queued':
      return m.reviewer_event_job_queued();
    case 'job_deferred_low_disk':
      return m.reviewer_event_job_deferred_low_disk();
    case 'job_started':
      return m.reviewer_event_job_started();
    case 'code_fetched':
      return m.reviewer_event_code_fetched();
    case 'job_completed':
      return m.reviewer_event_job_completed();
    case 'job_failed':
      return m.reviewer_event_job_failed();
    case 'extraction_alert_raised':
      return m.reviewer_event_extraction_alert_raised();
    case 'extraction_alert_cleared':
      return m.reviewer_event_extraction_alert_cleared();
    case 'extraction_rerun_queued':
      return m.reviewer_event_extraction_rerun_queued();
    case 'mail_sent':
      return m.reviewer_event_mail_sent();
    case 'mail_send_failed':
      return m.reviewer_event_mail_send_failed();
    case 'mail_send_abandoned':
      return m.reviewer_event_mail_send_abandoned();
    case 'delivery_alert_raised':
      return m.reviewer_event_delivery_alert_raised();
    case 'download_attempted':
      return m.reviewer_event_download_attempted();
    case 'collection_lapse_raised':
      return m.reviewer_event_collection_lapse_raised();
    case 'collection_lapse_cleared':
      return m.reviewer_event_collection_lapse_cleared();
    case 'download_token_revoked':
      return m.reviewer_event_download_token_revoked();
    case 'expired_uncollected':
      return m.reviewer_event_expired_uncollected();
    case 'object_deleted':
      return m.reviewer_event_object_deleted();
  }
}
