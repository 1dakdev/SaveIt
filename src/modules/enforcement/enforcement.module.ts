import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * Missed-payment enforcement.
 *
 * Phase 1 enforcement is reputational and procedural — the platform cannot
 * force a payment (no custody). This service flags missed contributions, docks
 * reputation, and can suspend a membership after repeat defaults. Grace windows
 * and escalation are driven by the jobs module.
 */
@Global()
@Injectable()
export class EnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Mark a member's contribution missed and dock reputation. */
  async flagMissed(periodId: string, memberUserId: string): Promise<void> {
    await this.prisma.contribution.updateMany({
      where: { periodId, memberId: memberUserId, status: { not: 'paid' } },
      data: { status: 'missed' },
    });
    const user = await this.prisma.user.findUnique({ where: { id: memberUserId } });
    const nextRep = Math.max(0, (user?.reputation ?? 100) - 20);
    await this.prisma.user.update({
      where: { id: memberUserId },
      data: { reputation: nextRep },
    });
    // SHORTCUT: repeat-default suspension (state -> suspended) not yet wired.
    await this.audit.record({
      actorId: memberUserId,
      action: 'enforcement.missed_flagged',
      target: periodId,
      metadata: { reputation: nextRep },
    });
  }
}

@Global()
@Module({
  providers: [EnforcementService],
  exports: [EnforcementService],
})
export class EnforcementModule {}
