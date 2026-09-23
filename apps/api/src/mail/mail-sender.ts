import { Injectable } from '@nestjs/common';
import { catalogue } from '../i18n/copy-catalogue';
import { MailDeliveries } from './mail-delivery.repository';
import { type MailParams, renderMail } from './mail-templates';
import { MailQueue } from './mail-queue';

/**
 * The one entry point every caller uses to send one of the four email kinds
 * (spec §16.3): creates the `mail_delivery` row, renders the template from
 * the copy catalogue, and enqueues the send. Rendering happens here, at
 * enqueue time, so the worker itself stays a dumb, generically-testable
 * SMTP-send-plus-audit step.
 */
@Injectable()
export class MailSender {
  constructor(
    private readonly mailDeliveries: MailDeliveries,
    private readonly queue: MailQueue,
  ) {}

  async send(requestId: string, to: string, params: MailParams): Promise<void> {
    const { subject, html } = renderMail(catalogue, params);
    const mailDeliveryId = await this.mailDeliveries.create(
      requestId,
      params.kind,
    );
    await this.queue.enqueue({
      mailDeliveryId,
      requestId,
      kind: params.kind,
      to,
      subject,
      html,
    });
  }
}
