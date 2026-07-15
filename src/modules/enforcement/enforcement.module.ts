import { Global, Injectable, Module } from '@nestjs/common';
import { config } from '../../config/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Missed-payment enforcement.
 *
 * Phase 1 enforcement is reputational and procedural — the platform cannot
 * force a payment (no custody). This service flags missed contributions, docks
 * reputation, and suspends a member in a circle once their unsettled arrears
 * reach the configured threshold. Settling arrears reverses the suspension.
 */
@Global()
@Injectable()
export class EnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Mark a member's contribution missed, dock reputation, and maybe suspend. */
  async flagMissed(periodId: string, memberUserId: string): Promise<void> {
    await this.prisma.contribution.updateMany({
      where: { periodId, memberId: memberUserId, status: { not: 'paid' } },
      data: { status: 'missed' },
    });
    const user = await this.prisma.user.findUnique({ where: { id: memberUserId } });
    const nextRep = Math.max(
      0,
      (user?.reputation ?? config.enforcement.defaultReputation) -
        config.enforcement.reputationDock,
    );
    await this.prisma.user.update({
      where: { id: memberUserId },
      data: { reputation: nextRep },
    });
    await this.audit.record({
      actorId: memberUserId,
      action: 'enforcement.missed_flagged',
      target: periodId,
      metadata: { reputation: nextRep },
    });

    // Escalate: suspend the member in the circle where they keep defaulting.
    const circleId = await this.circleIdForPeriod(periodId);
    if (circleId) await this.evaluateSuspension(circleId, memberUserId);
  }

  /**
   * Recompute a member's standing in a circle from their unsettled arrears.
   * At/above the threshold -> suspended; back below (after settling) -> active.
   * Suspension blocks the member's active-member actions in that circle.
   */
  async evaluateSuspension(circleId: string, memberUserId: string): Promise<void> {
    const arrears = await this.prisma.contribution.count({
      where: {
        memberId: memberUserId,
        status: 'missed',
        period: { cycle: { circleId } },
      },
    });
    const membership = await this.prisma.membership.findUnique({
      where: { userId_circleId: { userId: memberUserId, circleId } },
    });
    if (!membership) return;

    const threshold = config.enforcement.suspendThreshold;
    if (arrears >= threshold && membership.state === 'active') {
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { state: 'suspended' },
      });
      await this.audit.record({
        actorId: memberUserId,
        action: 'enforcement.suspended',
        target: circleId,
        metadata: { arrears, threshold },
      });
    } else if (arrears < threshold && membership.state === 'suspended') {
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: { state: 'active' },
      });
      await this.audit.record({
        actorId: memberUserId,
        action: 'enforcement.reinstated',
        target: circleId,
        metadata: { arrears, threshold },
      });
    }
  }

  private async circleIdForPeriod(periodId: string): Promise<string | null> {
    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      select: { cycle: { select: { circleId: true } } },
    });
    return period?.cycle.circleId ?? null;
  }
}

@Global()
@Module({
  providers: [EnforcementService],
  exports: [EnforcementService],
})
export class EnforcementModule {}
