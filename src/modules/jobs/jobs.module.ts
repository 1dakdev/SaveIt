import { Global, Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';

const QUEUE_NAME = 'sankofa-scheduler';

/**
 * Time-based work a savings product depends on (doc §4.2):
 *   - due-date reminders + escalating nudges
 *   - automatic period close once contributions are in / grace expires
 *   - missed-payment detection, flagging, locks
 *   - dispute-window countdowns
 *   - Phase 2: ACH pulls/payouts with retry + reconciliation
 *
 * SCAFFOLD: the queue/worker only start when REDIS_URL is set, so the API boots
 * without Redis in dev. Job payloads/handlers are stubs — flesh out `process()`.
 */
@Global()
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private queue?: Queue;
  private worker?: Worker;

  onModuleInit() {
    const connection = process.env.REDIS_URL;
    if (!connection) {
      this.logger.warn('REDIS_URL not set — background jobs disabled (dev mode)');
      return;
    }
    this.queue = new Queue(QUEUE_NAME, { connection: { url: connection } as never });
    this.worker = new Worker(QUEUE_NAME, async (job) => this.process(job.name, job.data), {
      connection: { url: connection } as never,
    });
    this.logger.log('Background jobs enabled');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Enqueue a job to run after `delayMs`. No-op when Redis is disabled. */
  async schedule(name: string, data: Record<string, unknown>, delayMs = 0): Promise<void> {
    if (!this.queue) {
      this.logger.debug(`[jobs disabled] would schedule ${name} in ${delayMs}ms`);
      return;
    }
    await this.queue.add(name, data, { delay: delayMs, removeOnComplete: true });
  }

  private async process(name: string, data: Record<string, unknown>): Promise<void> {
    // SHORTCUT: dispatch table of real handlers goes here (reminder, close,
    // flag-missed, dispute-expiry). For now just trace.
    this.logger.log(`processing job ${name}: ${JSON.stringify(data)}`);
  }
}

@Global()
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
