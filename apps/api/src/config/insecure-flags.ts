import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { smtpConfig, transportConfig } from './namespaces';

export const INSECURE_FLAG_NAMES = [
  'ALLOW_INSECURE_TRANSPORT',
  'SMTP_ALLOW_PLAINTEXT',
] as const;

export type InsecureFlagName = (typeof INSECURE_FLAG_NAMES)[number];

/** The insecure flags that are on. Neither is reachable by silent degradation. */
export function activeInsecureFlags(
  transport: Pick<ConfigType<typeof transportConfig>, 'allowInsecureTransport'>,
  smtp: Pick<ConfigType<typeof smtpConfig>, 'allowPlaintext'>,
): InsecureFlagName[] {
  const active: InsecureFlagName[] = [];
  if (transport.allowInsecureTransport) active.push('ALLOW_INSECURE_TRANSPORT');
  if (smtp.allowPlaintext) active.push('SMTP_ALLOW_PLAINTEXT');
  return active;
}

const REASONS: Record<InsecureFlagName, string> = {
  ALLOW_INSECURE_TRANSPORT:
    'http URLs are accepted and the Reviewer cookies drop Secure',
  SMTP_ALLOW_PLAINTEXT: 'mail may be sent without TLS',
};

/** Names the insecure flags that are on, at boot and in `/health`. */
@Injectable()
export class InsecureFlags implements OnApplicationBootstrap {
  private readonly logger = new Logger('Config');
  readonly active: InsecureFlagName[];

  constructor(
    @Inject(transportConfig.KEY)
    transport: ConfigType<typeof transportConfig>,
    @Inject(smtpConfig.KEY) smtp: ConfigType<typeof smtpConfig>,
  ) {
    this.active = activeInsecureFlags(transport, smtp);
  }

  onApplicationBootstrap() {
    for (const flag of this.active) {
      this.logger.warn(
        `${flag} is true: ${REASONS[flag]}. Never set in production.`,
      );
    }
  }
}
