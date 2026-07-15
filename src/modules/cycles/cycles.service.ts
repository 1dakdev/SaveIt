import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { config } from '../../config/config';
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
    const intervalDays =
      cycle.circle.frequency === 'weekly'
        ? config.rotation.weeklyIntervalDays
        : config.rotation.monthlyIntervalDays;
    const pot = cycle.circle.amount * active.length;

    return this.prisma.$transaction(async (tx) => {
      // Atomic compare-and-swap: only the transaction that flips proposed ->
      // active proceeds, so two near-simultaneous final approvals can't both
      // build the period set (the loser sees count 0 and returns the winner's
      // locked cycle rather than colliding on the (cycleId,index) constraint).
      const cas = await tx.cycle.updateMany({
        where: { id: cycleId, status: 'proposed' },
        data: { status: 'active', lockedAt: startDate, startDate },
      });
      if (cas.count === 0) {
        return tx.cycle.findUnique({ where: { id: cycleId }, include: { periods: true } });
      }
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
    const period = await this.prisma.period.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Period not found');
    // Contributions can only be paid into an open period; a missed obligation on
    // a closed period is an arrear, settled via settleArrear (not here).
    if (period.state !== 'collecting') {
      throw new BadRequestException(`Period is ${period.state}; not collecting contributions`);
    }

    const contribution = await this.prisma.contribution.findUnique({
      where: { periodId_memberId: { periodId, memberId: memberUserId } },
    });
    if (!contribution) throw new NotFoundException('No contribution obligation for this member');
    if (contribution.status === 'paid') return contribution; // idempotent

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
    // Closing a period releases the pot — organizer-only for user requests.
    await this.access.assertOrganizerByPeriod(periodId, actorUserId);
    return this.closePeriodInternal(periodId, force);
  }

  /**
   * The actual close logic, WITHOUT user authorization. Called by closePeriod
   * (after the organizer check) and by the scheduler as a system action. Do not
   * expose directly on a user-facing route.
   */
  async closePeriodInternal(periodId: string, force = false) {
    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      include: {
        contributions: true,
        cycle: { include: { circle: true, periods: true } },
      },
    });
    if (!period) throw new NotFoundException('Period not found');

    // Idempotent: a period that already paid out returns its existing payout
    // rather than closing twice (safe to retry after a dropped response).
    if (period.state === 'paid_out') {
      const existing = await this.prisma.payout.findUnique({ where: { periodId } });
      if (existing) return existing;
    }
    if (period.state !== 'collecting') {
      throw new BadRequestException(`Period is ${period.state}, not collecting`);
    }

    const unpaid = period.contributions.filter((c) => c.status !== 'paid');
    if (unpaid.length > 0 && !force) {
      throw new BadRequestException(`${unpaid.length} contribution(s) still pending`);
    }

    // The pot released now is only what was actually collected; missed
    // contributions remain outstanding arrears (see settleArrear), not losses
    // silently absorbed here.
    const amount = period.contributions
      .filter((c) => c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);

    const result = await this.prisma.$transaction(async (tx) => {
      // Atomic compare-and-swap: only the transaction that flips collecting ->
      // closed proceeds. A concurrent close sees count 0 and returns the winner's
      // payout, so the pot can never be released twice.
      const cas = await tx.period.updateMany({
        where: { id: periodId, state: 'collecting' },
        data: { state: 'closed' },
      });
      if (cas.count === 0) {
        const existing = await tx.payout.findUnique({ where: { periodId } });
        if (existing) return { payout: existing, closed: false };
        throw new ConflictException('Period is already being closed');
      }

      if (force) {
        await tx.contribution.updateMany({
          where: { periodId, status: { not: 'paid' } },
          data: { status: 'missed' },
        });
      }

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
      return { payout, closed: true };
    });

    // Only the transaction that actually closed the period runs enforcement.
    // Reputational enforcement is the only lever in custody-less Phase 1.
    if (result.closed && force) {
      for (const c of unpaid) {
        await this.enforcement.flagMissed(periodId, c.memberId);
      }
    }

    return result.payout;
  }

  /**
   * Settle an outstanding arrear: a member pays a contribution they previously
   * missed (money owed to that period's recipient, who received a short pot).
   * Phase 1 is coordination-only, so this records the settlement — it does not
   * move funds. Reputation stays docked: missing the deadline still cost them.
   *
   * NOTE: the terminal case — a defaulter who never settles — is a loss-bearing
   * BUSINESS DECISION that is deliberately not encoded here. The debt simply
   * stays open until settled or explicitly written off by a future policy.
   */
  async settleArrear(periodId: string, memberUserId: string) {
    // A suspended member must be able to pay their way back, so this requires
    // participation (not active membership) — settling is how they get reinstated.
    const circleId = await this.access.circleIdForPeriod(periodId);
    await this.access.assertParticipant(circleId, memberUserId);
    const contribution = await this.prisma.contribution.findUnique({
      where: { periodId_memberId: { periodId, memberId: memberUserId } },
    });
    if (!contribution) throw new NotFoundException('No contribution obligation for this member');
    if (contribution.status !== 'missed') {
      throw new BadRequestException('No outstanding arrear to settle for this period');
    }

    const period = await this.prisma.period.findUnique({ where: { id: periodId } });
    const recipient = await this.prisma.membership.findUnique({
      where: { id: period!.recipientId },
    });

    const settled = await this.prisma.contribution.update({
      where: { id: contribution.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    await this.audit.record({
      actorId: memberUserId,
      action: 'arrear.settled',
      target: periodId,
      metadata: { amount: contribution.amount, owedTo: recipient!.userId },
    });

    // Settling may bring the member back below the suspension threshold.
    await this.enforcement.evaluateSuspension(circleId, memberUserId);
    return settled;
  }

  /**
   * Defer a turn: the current recipient passes the pot to the next member and
   * moves back one slot (spec §6.4). Implemented as a swap of the two periods'
   * recipients and the two memberships' rotation order. Only allowed before the
   * period pays out, and only by the recipient themselves.
   */
  async deferTurn(periodId: string, actorUserId: string) {
    const period = await this.prisma.period.findUnique({
      where: { id: periodId },
      include: { cycle: { include: { periods: true } } },
    });
    if (!period) throw new NotFoundException('Period not found');
    if (period.state === 'closed' || period.state === 'paid_out') {
      throw new BadRequestException('Cannot defer a period that has already paid out');
    }

    const recipient = await this.prisma.membership.findUnique({ where: { id: period.recipientId } });
    if (!recipient || recipient.userId !== actorUserId) {
      throw new ForbiddenException('Only the upcoming recipient can defer their turn');
    }

    const next = period.cycle.periods.find((p) => p.index === period.index + 1);
    if (!next) throw new BadRequestException('No later turn to defer to');

    const currentMembershipId = period.recipientId;
    const nextMembershipId = next.recipientId;

    await this.prisma.$transaction(async (tx) => {
      // Swap which membership receives in each of the two periods.
      await tx.period.update({ where: { id: period.id }, data: { recipientId: nextMembershipId } });
      await tx.period.update({ where: { id: next.id }, data: { recipientId: currentMembershipId } });
      // Keep membership.order consistent with the new receipt order.
      await tx.membership.update({ where: { id: currentMembershipId }, data: { order: next.index } });
      await tx.membership.update({ where: { id: nextMembershipId }, data: { order: period.index } });
      await this.audit.record({
        actorId: actorUserId,
        action: 'turn.deferred',
        target: periodId,
        metadata: { toPeriodIndex: next.index },
      });
    });

    return this.prisma.period.findMany({
      where: { cycleId: period.cycleId },
      orderBy: { index: 'asc' },
    });
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
