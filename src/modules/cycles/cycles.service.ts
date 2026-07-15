import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessService } from '../../common/access.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EnforcementService } from '../enforcement/enforcement.module';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly enforcement: EnforcementService,
    private readonly access: AccessService,
  ) {}

  /**
   * Lock a proposed cycle once every active member has approved the order.
   * Fixes the rotation, builds one Period per member, and opens the first
   * period for contributions.
   */
  async lock(cycleId: string) {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { circle: { include: { memberships: true } }, votes: true },
    });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'proposed') {
      throw new BadRequestException(`Cycle is ${cycle.status}, not proposed`);
    }

    const active = cycle.circle.memberships
      .filter((m) => m.state === 'active')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (active.length < 2) {
      throw new BadRequestException('A circle needs at least 2 active members');
    }
    if (active.some((m) => m.order === null)) {
      throw new BadRequestException('Rotation order not fully assigned');
    }

    const approvals = new Set(
      cycle.votes.filter((v) => v.value === 'approve').map((v) => v.membershipId),
    );
    const allApproved = active.every((m) => approvals.has(m.id));
    if (!allApproved) {
      throw new BadRequestException('Not all members have approved the rotation order');
    }

    const startDate = new Date();
    const intervalDays = cycle.circle.frequency === 'weekly' ? 7 : 30;
    const pot = cycle.circle.amount * active.length;

    return this.prisma.$transaction(async (tx) => {
      await tx.cycle.update({
        where: { id: cycleId },
        data: { status: 'active', lockedAt: startDate, startDate },
      });
      await tx.circle.update({ where: { id: cycle.circleId }, data: { status: 'active' } });

      // One period per member; recipient = member whose order matches the index.
      for (const member of active) {
        const idx = member.order as number;
        const dueDate = new Date(startDate.getTime() + idx * intervalDays * DAY_MS);
        const period = await tx.period.create({
          data: {
            cycleId,
            index: idx,
            recipientId: member.id,
            dueDate,
            state: idx === 0 ? 'collecting' : 'upcoming',
          },
        });
        // Open contributions for the first period immediately.
        if (idx === 0) {
          await tx.contribution.createMany({
            data: active.map((m) => ({
              periodId: period.id,
              memberId: m.userId,
              amount: cycle.circle.amount,
            })),
          });
        }
      }

      await this.audit.record({
        action: 'cycle.locked',
        target: cycleId,
        metadata: { members: active.length, pot },
      });
      return tx.cycle.findUnique({ where: { id: cycleId }, include: { periods: true } });
    });
  }

  /** Member marks their own Phase-1 obligation as settled off-platform. */
  async markPaid(periodId: string, memberUserId: string) {
    // Caller must be an active member of the circle owning this period; they
    // can only ever settle their own contribution (looked up by their id).
    await this.access.assertMemberByPeriod(periodId, memberUserId);
    const contribution = await this.prisma.contribution.findUnique({
      where: { periodId_memberId: { periodId, memberId: memberUserId } },
    });
    if (!contribution) throw new NotFoundException('No contribution obligation for this member');
    if (contribution.status === 'paid') return contribution;

    const updated = await this.prisma.contribution.update({
      where: { id: contribution.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    await this.audit.record({
      actorId: memberUserId,
      action: 'contribution.paid',
      target: periodId,
    });
    return updated;
  }

  /**
   * Close a collecting period. If every contribution is paid (or `force` after
   * grace) the pot is released to the recipient and the next period opens.
   */
  async closePeriod(periodId: string, actorUserId: string, force = false) {
    // Closing a period releases the pot — organizer-only. (A scheduled job will
    // also call this path once contributions are in / grace expires.)
    await this.access.assertOrganizerByPeriod(periodId, actorUserId);
    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      include: {
        contributions: true,
        cycle: { include: { circle: true, periods: true } },
      },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.state !== 'collecting') {
      throw new BadRequestException(`Period is ${period.state}, not collecting`);
    }

    const unpaid = period.contributions.filter((c) => c.status !== 'paid');
    if (unpaid.length > 0 && !force) {
      throw new BadRequestException(`${unpaid.length} contribution(s) still pending`);
    }

    const amount = period.contributions
      .filter((c) => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);

    const payout = await this.prisma.$transaction(async (tx) => {
      if (force) {
        await tx.contribution.updateMany({
          where: { periodId, status: { not: 'paid' } },
          data: { status: 'missed' },
        });
      }
      await tx.period.update({ where: { id: periodId }, data: { state: 'closed' } });

      // Look up recipient's userId for the payout.
      const recipient = await tx.membership.findUnique({ where: { id: period.recipientId } });
      const payout = await tx.payout.create({
        data: {
          periodId,
          recipientId: recipient!.userId,
          amount,
          status: 'released',
        },
      });
      await tx.period.update({ where: { id: periodId }, data: { state: 'paid_out' } });

      // Advance: open the next period for contributions.
      const next = period.cycle.periods.find((p) => p.index === period.index + 1);
      if (next) {
        await tx.period.update({ where: { id: next.id }, data: { state: 'collecting' } });
        const active = await tx.membership.findMany({
          where: { circleId: period.cycle.circleId, state: 'active' },
        });
        await tx.contribution.createMany({
          data: active.map((m) => ({
            periodId: next.id,
            memberId: m.userId,
            amount: period.cycle.circle.amount,
          })),
        });
      } else {
        await tx.cycle.update({ where: { id: period.cycleId }, data: { status: 'complete' } });
        await tx.circle.update({
          where: { id: period.cycle.circleId },
          data: { status: 'complete' },
        });
      }

      await this.audit.record({
        action: force ? 'period.closed_grace' : 'period.closed',
        target: periodId,
        metadata: { amount, missed: unpaid.length },
      });
      return payout;
    });

    // Reputational enforcement is the only lever in custody-less Phase 1: dock
    // reputation and audit each member who missed this period.
    if (force) {
      for (const c of unpaid) {
        await this.enforcement.flagMissed(periodId, c.memberId);
      }
    }

    return payout;
  }

  /** Phase 1: recipient confirms they received the pot off-platform. */
  async confirmReceipt(periodId: string, recipientUserId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { periodId } });
    if (!payout) throw new NotFoundException('No payout for this period');
    if (payout.recipientId !== recipientUserId) {
      throw new BadRequestException('Only the recipient can confirm receipt');
    }
    const updated = await this.prisma.payout.update({
      where: { periodId },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await this.audit.record({
      actorId: recipientUserId,
      action: 'payout.confirmed',
      target: periodId,
    });
    return updated;
  }

  async getCycle(cycleId: string, actorUserId: string) {
    const cycle = await this.prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { periods: { include: { contributions: true, payout: true } }, votes: true },
    });
    if (!cycle) throw new NotFoundException('Cycle not found');
    // Only circle participants may see its financial state.
    await this.access.assertParticipant(cycle.circleId, actorUserId);
    return cycle;
  }
}
