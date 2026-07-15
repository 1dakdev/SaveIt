import { Global, Injectable, Logger, Module } from '@nestjs/common';

export type NotificationChannel = 'push' | 'sms' | 'email';

/**
 * Notification dispatch — STUB.
 *
 * Phase 1 routes through Expo Push (APNs/FCM), Twilio (SMS), and Resend/SES
 * (email), honouring per-user preferences. Here we log; wire the providers in
 * `send()` and add a preferences check.
 */
@Global()
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async send(params: {
    userId: string;
    channel: NotificationChannel;
    title: string;
    body: string;
  }): Promise<void> {
    this.logger.log(
      `[${params.channel}] -> ${params.userId}: ${params.title} — ${params.body}`,
    );
  }
}

@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
