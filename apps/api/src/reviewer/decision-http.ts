import { BadRequestException } from '@nestjs/common';
import { type DecidingReviewer } from './decisions.service';
import { type ReviewerRequest } from './reviewer-auth.guard';

// Shared by every controller that acts on behalf of the signed-in Reviewer or
// takes the mandatory internal note: one shape for "who is asking" and one for
// "what they typed", so the two controllers under /reviewer/queue and
// /reviewer/decisions cannot drift on either.

export function reviewerOf(req: ReviewerRequest): DecidingReviewer {
  const reviewer = req.reviewer!;
  return { reviewerId: reviewer.reviewerId, displayName: reviewer.displayName };
}

export function noteFrom(body: unknown): string {
  const note = (body as { note?: unknown } | null)?.note;
  if (typeof note !== 'string') {
    throw new BadRequestException({ error: 'bad_request' });
  }
  return note;
}
