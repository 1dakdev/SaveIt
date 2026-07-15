import { Injectable, Logger, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CyclesModule } from '../cycles/cycles.module';
import { CyclesService } from '../cycles/cycles.service';
import { NotificationsService } from '../notifications/notifications.module';

const DAY_MS = 24 * 60 * 60 * 1000;
const QUEUE_NAME = 'sankofa-scheduler';
const SWEEP_JOB = 'sweep';
const REMINDER_LEAD_DAYS = 2;

export interface SweepResult {
  closedClean: number;
  closedGrace: number;
  expiredDisputes: number;
  reminded: number;
}

/**
 * Time-driven sweep. A single idempotent `tick(now)` does all the periodic work
 * a savings product needs — auto-close, dispute expiry, reminders — so it can be
 * unit-tested by calling it directly. In production a BullMQ repeatable job runs
 * it on an interval (only when REDIS_URL is set).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cycles: CyclesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async tick(now: Date): Promise<SweepResult> {
    const result: SweepResult = { closedClean: 0, closedGrace: 0, expiredDisputes: 0, reminded: 0 };
    const graceMs = config.gracePeriodDays * DAY_MS;

    // 1. Auto-close: clean once everyone has paid, grace-force once overdue.
    const collecting = await this.prisma.period.findMany({
      where: { state: 'collecting' },
      include: { contributions: true },
    });
    for (const period of collecting) {
      const allPaid =
        period.contributions.length > 0 && period.contributions.every((c) => c.status === 'paid');
      const overdue = now.getTime() > period.dueDate.getTime() + graceMs;
      if (allPaid) {
        await this.cycles.closePeriodInternal(period.id, false);
        result.closedClean += 1;
      } else if (overdue) {
        await this.cycles.closePeriodInternal(period.id, true);
        result.closedGrace += 1;
      }
    }

    // 2. Expire disputes whose 3-day window has elapsed without resolution.
    const stale = await this.prisma.dispute.findMany({
      where: { status: 'open', resolvesAt: { lte: now } },
    });
    for (const dispute of stale) {
      await this.prisma.dispute.update({
        where: { id: dispute.id },
        data: { status: 'expired', resolvedAt: now },
      });
      await this.audit.record({ action: 'dispute.expired', target: dispute.id });
      result.expiredDisputes += 1;
    }

    // 3. Remind members with a pending contribution as the due date approaches.
    const upcoming = await this.prisma.period.findMany({
      where: {
        state: 'collecting',
        dueDate: { gte: now, lte: new Date(now.getTime() + REMINDER_LEAD_DAYS * DAY_MS) },
      },
      include: { contributions: { where: { status: 'pending' } } },
    });
    for (const period of upcoming) {
      for (const c of period.contributions) {
        await this.notifications.send({
          userId: c.memberId,
          channel: 'push',
          title: 'Contribution due soon',
          body: `Your contribution is due on ${period.dueDate.toDateString()}.`,
        });
        result.reminded += 1;
      }
    }

    return result;
  }

  // --- BullMQ repeatable driver (only active when REDIS_URL is configured) ---

  onModuleInit() {
    const connection = process.env.REDIS_URL;
    if (!connection) {
      this.logger.warn('REDIS_URL not set — scheduler sweep runs on-demand only (dev)');
      return;
    }
    this.queue = new Queue(QUEUE_NAME, { connection: { url: connection } as never });
    this.worker = new Worker(QUEUE_NAME, async () => this.tick(new Date()), {
      connection: { url: connection } as never,
    });
    // Run the sweep every minute.
    void this.queue.add(SWEEP_JOB, {}, {
      repeat: { every: 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log('Scheduler sweep enabled (every 60s)');
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }
}

@Module({
  imports: [CyclesModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
